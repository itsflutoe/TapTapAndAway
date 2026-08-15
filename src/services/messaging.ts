import { supabase } from '../lib/supabase';
import {
  haversineKm,
  calculateStampCost,
  calculateFlightSeconds,
  getWeatherForRoute,
} from '../lib/geo';
import type { Message, Delivery, Profile } from '../types';

export async function getOrCreateConversation(
  userA: string,
  userB: string
): Promise<string> {
  // Find existing conversation between the two users
  const { data: existing } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userA);

  if (existing && existing.length > 0) {
    const convIds = existing.map((e) => e.conversation_id);
    const { data: shared } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userB)
      .in('conversation_id', convIds)
      .limit(1)
      .maybeSingle();
    if (shared) return shared.conversation_id;
  }

  // Create new
  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single();
  if (error || !conv) throw new Error('Failed to create conversation');

  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: userA },
    { conversation_id: conv.id, user_id: userB },
  ]);

  return conv.id;
}

export interface SendMessageParams {
  senderId: string;
  receiverId: string;
  content: string;
  senderProfile: Profile;
  receiverProfile: Profile;
  pigeonId: string;
  timeMultiplier?: number; // from system_settings, default 3600 for testing
}

export async function sendPigeonMessage(params: SendMessageParams): Promise<{
  message: Message;
  delivery: Delivery;
}> {
  const {
    senderId,
    receiverId,
    content,
    senderProfile,
    receiverProfile,
    pigeonId,
    timeMultiplier = 3600,
  } = params;

  if (
    senderProfile.latitude == null ||
    senderProfile.longitude == null ||
    receiverProfile.latitude == null ||
    receiverProfile.longitude == null
  ) {
    throw new Error('Both users need valid addresses for delivery.');
  }

  const distanceKm = haversineKm(
    senderProfile.latitude,
    senderProfile.longitude,
    receiverProfile.latitude,
    receiverProfile.longitude
  );

  const stampCost = calculateStampCost(distanceKm);

  // Check balance
  if (senderProfile.stamp_balance < stampCost) {
    throw new Error('Not enough Stamps.');
  }

  // Weather
  const weather = await getWeatherForRoute(
    senderProfile.latitude,
    senderProfile.longitude,
    receiverProfile.latitude,
    receiverProfile.longitude
  );

  const baseSpeed = 100; // mph
  const modifiedSpeed = baseSpeed * weather.multiplier;
  const realSeconds = calculateFlightSeconds(distanceKm, modifiedSpeed);
  // Apply testing multiplier so deliveries finish in seconds during development
  const estimatedSeconds = Math.max(3, Math.round(realSeconds / timeMultiplier));

  // Deduct stamps via RPC (server-side)
  const { error: stampErr } = await supabase.rpc('adjust_stamps', {
    p_user_id: senderId,
    p_amount: -stampCost,
    p_type: 'message_sent',
    p_description: `Message sent to ${receiverProfile.display_name}`,
  });
  if (stampErr) {
    throw new Error(stampErr.message.includes('Insufficient') ? 'Not enough Stamps.' : stampErr.message);
  }

  const conversationId = await getOrCreateConversation(senderId, receiverId);

  // Create message
  const { data: message, error: msgErr } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      receiver_id: receiverId,
      content: content.trim(),
      stamp_cost: stampCost,
    })
    .select('*')
    .single();
  if (msgErr || !message) {
    // Refund on failure
    await supabase.rpc('adjust_stamps', {
      p_user_id: senderId,
      p_amount: stampCost,
      p_type: 'failed_delivery_refund',
      p_description: 'Refund after message creation failure',
    });
    throw new Error('Failed to create message.');
  }

  // Create delivery
  const { data: delivery, error: delErr } = await supabase
    .from('deliveries')
    .insert({
      message_id: message.id,
      pigeon_id: pigeonId,
      origin_latitude: senderProfile.latitude,
      origin_longitude: senderProfile.longitude,
      destination_latitude: receiverProfile.latitude,
      destination_longitude: receiverProfile.longitude,
      distance_km: Math.round(distanceKm * 100) / 100,
      base_speed_mph: baseSpeed,
      modified_speed_mph: Math.round(modifiedSpeed * 100) / 100,
      weather: weather.condition,
      weather_multiplier: weather.multiplier,
      estimated_duration_seconds: estimatedSeconds,
      status: 'DISPATCHED',
      actual_departure: new Date().toISOString(),
      progress_percent: 0,
    })
    .select('*')
    .single();

  if (delErr || !delivery) {
    throw new Error('Failed to create delivery.');
  }

  // Start simulated flight (client will poll/update progress; for prototype we also schedule completion)
  // In a full production app this would be a background job / Edge Function.
  // For Phase 1 we update status from the client timer after estimatedSeconds.

  return {
    message: message as Message,
    delivery: delivery as Delivery,
  };
}

export async function completeDelivery(deliveryId: string, messageId: string, receiverId: string) {
  // Random low chance of failure
  const failChance = 0.005;
  const failed = Math.random() < failChance;

  if (failed) {
    await supabase
      .from('deliveries')
      .update({
        status: 'FAILED',
        failure_reason: 'The pigeon encountered unexpected weather and returned home.',
        actual_arrival: new Date().toISOString(),
        progress_percent: 100,
      })
      .eq('id', deliveryId);

    // Refund stamps
    const { data: msg } = await supabase
      .from('messages')
      .select('stamp_cost, sender_id')
      .eq('id', messageId)
      .single();
    if (msg) {
      await supabase.rpc('adjust_stamps', {
        p_user_id: msg.sender_id,
        p_amount: msg.stamp_cost,
        p_type: 'failed_delivery_refund',
        p_reference_id: deliveryId,
        p_description: 'Failed delivery refund',
      });
    }
    return { status: 'FAILED' as const };
  }

  await supabase
    .from('deliveries')
    .update({
      status: 'DELIVERED',
      actual_arrival: new Date().toISOString(),
      progress_percent: 100,
    })
    .eq('id', deliveryId);

  // Create notification for receiver
  await supabase.from('notifications').insert({
    user_id: receiverId,
    type: 'message_delivered',
    title: 'Pigeon arrived!',
    message: 'A message has been delivered to you.',
    data: { message_id: messageId },
  });

  return { status: 'DELIVERED' as const };
}

export async function markMessageRead(messageId: string) {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('read_at', null);

  await supabase
    .from('deliveries')
    .update({ status: 'READ' })
    .eq('message_id', messageId)
    .eq('status', 'DELIVERED');
}
