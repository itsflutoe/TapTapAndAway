import { supabase } from '../lib/supabase';
import {
  haversineKm,
  calculateStampCost,
  calculateFlightSeconds,
  getWeatherForRoute,
} from '../lib/geo';
import type { Message, Delivery, Profile } from '../types';

export async function getOrCreateConversation(
  _userA: string,
  userB: string
): Promise<string> {
  // Prefer security-definer RPC (runs as definer; still requires auth.uid() and validates peer)
  const { data: rpcId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
    p_other_user_id: userB,
  });

  if (!rpcErr && rpcId) {
    return rpcId as string;
  }

  // Fallback: direct inserts (requires migration 003/004 policies + grants)
  if (rpcErr) {
    console.warn('get_or_create_conversation RPC failed, falling back:', rpcErr.message);
  }

  const { data: existing, error: existingErr } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', _userA);

  if (existingErr) {
    throw new Error(`Conversation lookup failed: ${existingErr.message}`);
  }

  if (existing && existing.length > 0) {
    const convIds = existing.map((e) => e.conversation_id);
    const { data: shared, error: sharedErr } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userB)
      .in('conversation_id', convIds)
      .limit(1)
      .maybeSingle();

    if (sharedErr) {
      throw new Error(`Conversation lookup failed: ${sharedErr.message}`);
    }
    if (shared) return shared.conversation_id;
  }

  const { data: conv, error } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single();

  if (error || !conv) {
    throw new Error(
      error?.message
        ? `Failed to create conversation: ${error.message}`
        : rpcErr?.message
          ? `Failed to create conversation: ${rpcErr.message}`
          : 'Failed to create conversation'
    );
  }

  const { error: membersErr } = await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: _userA },
    { conversation_id: conv.id, user_id: userB },
  ]);

  if (membersErr) {
    throw new Error(`Failed to add conversation members: ${membersErr.message}`);
  }

  return conv.id;
}

export interface SendMessageParams {
  senderId: string;
  receiverId: string;
  content: string;
  senderProfile: Profile;
  receiverProfile: Profile;
  pigeonId: string;
  timeMultiplier?: number;
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

  if (senderProfile.stamp_balance < stampCost) {
    throw new Error('Not enough Stamps.');
  }

  const weather = await getWeatherForRoute(
    senderProfile.latitude,
    senderProfile.longitude,
    receiverProfile.latitude,
    receiverProfile.longitude
  );

  const baseSpeed = 100;
  const modifiedSpeed = baseSpeed * weather.multiplier;
  const realSeconds = calculateFlightSeconds(distanceKm, modifiedSpeed);
  const estimatedSeconds = Math.max(3, Math.round(realSeconds / timeMultiplier));

  // Create conversation first (before charging stamps)
  const conversationId = await getOrCreateConversation(senderId, receiverId);

  // Deduct stamps server-side
  const { error: stampErr } = await supabase.rpc('adjust_stamps', {
    p_user_id: senderId,
    p_amount: -stampCost,
    p_type: 'message_sent',
    p_description: `Message sent to ${receiverProfile.display_name}`,
  });
  if (stampErr) {
    throw new Error(
      stampErr.message.includes('Insufficient')
        ? 'Not enough Stamps.'
        : `Stamp error: ${stampErr.message}`
    );
  }

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
    await supabase.rpc('adjust_stamps', {
      p_user_id: senderId,
      p_amount: stampCost,
      p_type: 'failed_delivery_refund',
      p_description: 'Refund after message creation failure',
    });
    throw new Error(
      msgErr?.message ? `Failed to create message: ${msgErr.message}` : 'Failed to create message.'
    );
  }

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
    throw new Error(
      delErr?.message ? `Failed to create delivery: ${delErr.message}` : 'Failed to create delivery.'
    );
  }

  return {
    message: message as Message,
    delivery: delivery as Delivery,
  };
}

export async function completeDelivery(
  deliveryId: string,
  messageId: string,
  receiverId: string
) {
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
