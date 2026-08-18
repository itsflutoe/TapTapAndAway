import { supabase, assertSupabaseConfigured } from '../lib/supabase';
import {
  haversineKm,
  calculateStampCost,
  fetchKmPerStamp,
  calculateFlightSeconds,
  applyTimeMultiplier,
  getWeatherForRoute,
} from '../lib/geo';
import type { Message, Delivery, Profile } from '../types';

export interface EventEffects {
  free_sends: boolean;
  stamp_multiplier: number;
  speed_multiplier: number;
  double_daily: boolean;
}

export async function getEventEffects(): Promise<EventEffects> {
  const defaults: EventEffects = {
    free_sends: false,
    stamp_multiplier: 1,
    speed_multiplier: 1,
    double_daily: false,
  };
  try {
    const { data, error } = await supabase.rpc('get_event_effects');
    if (error || !data) return defaults;
    const d = data as Record<string, unknown>;
    return {
      free_sends: !!d.free_sends,
      stamp_multiplier: Math.max(1, Number(d.stamp_multiplier) || 1),
      speed_multiplier: Math.max(1, Number(d.speed_multiplier) || 1),
      double_daily: !!d.double_daily,
    };
  } catch {
    return defaults;
  }
}

export async function getOrCreateConversation(
  _userA: string,
  userB: string
): Promise<string> {
  assertSupabaseConfigured();

  const { data: rpcId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
    p_other_user_id: userB,
  });

  if (!rpcErr && rpcId) {
    return rpcId as string;
  }

  if (rpcErr) {
    console.warn('get_or_create_conversation RPC failed, falling back:', rpcErr.message);
    if (rpcErr.message.includes('API key') || rpcErr.message.includes('apikey')) {
      throw new Error(
        'Supabase API key missing. In Vercel set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then Redeploy.'
      );
    }
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
    const detail = error?.message || rpcErr?.message || 'unknown error';
    const friendly =
      detail.includes('API key') || detail.includes('apikey')
        ? 'Supabase API key missing. In Vercel set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then Redeploy.'
        : detail;
    throw new Error(`Failed to create conversation: ${friendly}`);
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
  assertSupabaseConfigured();

  const {
    senderId,
    receiverId,
    content,
    senderProfile,
    receiverProfile,
    pigeonId,
    timeMultiplier,
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

  // Active events: free_sends, stamp_multiplier, speed_multiplier
  const effects = await getEventEffects();
  const kmPerStamp = await fetchKmPerStamp(async (key) => {
    const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle();
    if (data?.value == null) return null;
    return typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
  });
  let stampCost = calculateStampCost(distanceKm, kmPerStamp);
  if (effects.free_sends) {
    stampCost = 0;
  } else if (effects.stamp_multiplier > 1) {
    // Higher multiplier = cheaper sends (e.g. 2 → half cost, min 1)
    stampCost = Math.max(1, Math.ceil(stampCost / effects.stamp_multiplier));
  }

  if (stampCost > 0 && senderProfile.stamp_balance < stampCost) {
    throw new Error('Not enough Stamps.');
  }

  // Economy pause / maintenance (admin settings)
  const { data: paused } = await supabase.rpc('is_sending_paused');
  if (paused === true) {
    throw new Error('Sending is temporarily paused by an administrator. Try again later.');
  }
  const { data: maint } = await supabase.rpc('is_maintenance_mode');
  if (maint === true) {
    const { data: maintMsg } = await supabase.rpc('get_maintenance_message');
    throw new Error(
      typeof maintMsg === 'string' && maintMsg
        ? maintMsg
        : 'Maintenance in progress. Sending is unavailable.'
    );
  }

  const weather = await getWeatherForRoute(
    senderProfile.latitude,
    senderProfile.longitude,
    receiverProfile.latitude,
    receiverProfile.longitude
  );

  const baseSpeed = 100;
  const modifiedSpeed = baseSpeed * weather.multiplier * (effects.speed_multiplier || 1);
  const realSeconds = calculateFlightSeconds(distanceKm, modifiedSpeed);

  // Prefer live admin setting; fall back to param only if RPC unavailable
  let multiplier = timeMultiplier;
  const { data: multData } = await supabase.rpc('get_time_multiplier');
  if (multData != null && Number(multData) > 0) {
    multiplier = Number(multData);
  } else if (multiplier == null || multiplier <= 0) {
    multiplier = 1;
  }

  const estimatedSeconds = applyTimeMultiplier(realSeconds, multiplier);

  // Anti-spam: max 5 messages / 60s (skip check if RPC not deployed yet)
  const { data: canSend, error: rateErr } = await supabase.rpc('can_send_message', {
    p_user_id: senderId,
    p_max: 5,
    p_window_seconds: 60,
  });
  if (!rateErr && canSend === false) {
    throw new Error('You are sending too fast. Please wait a moment before sending another pigeon.');
  }

  const conversationId = await getOrCreateConversation(senderId, receiverId);

  if (stampCost > 0) {
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
    if (stampCost > 0) {
      await supabase.rpc('adjust_stamps', {
        p_user_id: senderId,
        p_amount: stampCost,
        p_type: 'failed_delivery_refund',
        p_description: 'Refund after message creation failure',
      });
    }
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
      status: 'FLYING',
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

/** Best-effort progress write for Conversation/Admin UI. Non-fatal if blocked. */
export async function updateDeliveryProgress(
  deliveryId: string,
  progressPercent: number
): Promise<void> {
  const pct = Math.max(0, Math.min(100, Math.round(progressPercent)));
  await supabase
    .from('deliveries')
    .update({ progress_percent: pct, status: 'FLYING' })
    .eq('id', deliveryId)
    .in('status', ['DRAFT', 'PREPARING', 'DISPATCHED', 'FLYING', 'ARRIVED']);
}

/**
 * Complete active deliveries past ETA for this user so flights resolve
 * even if nobody has the Delivery map page open.
 */
export async function resolveOverdueDeliveriesForUser(userId: string): Promise<number> {
  if (!userId) return 0;

  const { data: msgs } = await supabase
    .from('messages')
    .select('id, receiver_id')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(40);

  if (!msgs?.length) return 0;

  const msgIds = msgs.map((m) => m.id);
  const { data: dels } = await supabase
    .from('deliveries')
    .select('id, message_id, status, actual_departure, estimated_duration_seconds')
    .in('message_id', msgIds)
    .in('status', ['DRAFT', 'PREPARING', 'DISPATCHED', 'FLYING', 'ARRIVED']);

  if (!dels?.length) return 0;

  const now = Date.now();
  let n = 0;
  for (const d of dels) {
    if (!d.actual_departure || !d.estimated_duration_seconds) continue;
    const end =
      new Date(d.actual_departure).getTime() + Number(d.estimated_duration_seconds) * 1000;
    if (now < end) continue;
    const msg = msgs.find((m) => m.id === d.message_id);
    try {
      await completeDelivery(d.id, d.message_id, msg?.receiver_id || userId);
      n++;
    } catch (e) {
      console.warn('resolveOverdue', d.id, e);
    }
  }
  return n;
}

/** Statuses a delivery can still be in before it's been resolved. */
export const ACTIVE_DELIVERY_STATUSES = [
  'DRAFT',
  'PREPARING',
  'DISPATCHED',
  'FLYING',
  'ARRIVED',
];

export interface CompleteDeliveryResult {
  status: 'DELIVERED' | 'FAILED' | 'READ';
}

/**
 * Resolves a delivery to DELIVERED or FAILED.
 *
 * Idempotent by design: this can be called more than once for the same
 * delivery (e.g. the sender's and receiver's tabs both reach the end of
 * the flight, or a client retries after a dropped response) without ever
 * double-refunding Stamps, double-counting pigeon stats, or sending a
 * duplicate notification. Only the caller whose UPDATE actually flips the
 * delivery out of an active status runs the side effects; every other
 * caller just gets back the delivery's real, current status from the DB —
 * the frontend never decides completion on its own.
 */
export async function completeDelivery(
  deliveryId: string,
  messageId: string,
  receiverId: string
): Promise<CompleteDeliveryResult> {
  const failChance = 0.005;
  const failed = Math.random() < failChance;

  if (failed) {
    const { data: failRow } = await supabase
      .from('deliveries')
      .update({
        status: 'FAILED',
        failure_reason: 'The pigeon encountered unexpected weather and returned home.',
        actual_arrival: new Date().toISOString(),
        progress_percent: 100,
      })
      .eq('id', deliveryId)
      .in('status', ACTIVE_DELIVERY_STATUSES)
      .select('pigeon_id')
      .maybeSingle();

    if (!failRow) {
      // Someone else already resolved this delivery — report the real status.
      return await fetchResolvedStatus(deliveryId, 'FAILED');
    }

    if (failRow.pigeon_id) {
      await supabase.rpc('record_failed_flight', { p_pigeon_id: failRow.pigeon_id });
    }

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
    return { status: 'FAILED' };
  }

  const { data: delRow } = await supabase
    .from('deliveries')
    .update({
      status: 'DELIVERED',
      actual_arrival: new Date().toISOString(),
      progress_percent: 100,
    })
    .eq('id', deliveryId)
    .in('status', ACTIVE_DELIVERY_STATUSES)
    .select('pigeon_id, distance_km')
    .maybeSingle();

  if (!delRow) {
    // Someone else already resolved this delivery — report the real status.
    return await fetchResolvedStatus(deliveryId, 'DELIVERED');
  }

  if (delRow.pigeon_id) {
    await supabase.rpc('record_successful_flight', {
      p_pigeon_id: delRow.pigeon_id,
      p_distance_km: delRow.distance_km,
    });
  }

  await supabase.from('notifications').insert({
    user_id: receiverId,
    type: 'message_delivered',
    title: 'Pigeon arrived!',
    message: 'A message has been delivered to you.',
    data: { message_id: messageId },
  });

  return { status: 'DELIVERED' };
}

/** Reads back the delivery's authoritative status when this caller lost the completion race. */
async function fetchResolvedStatus(
  deliveryId: string,
  fallback: CompleteDeliveryResult['status']
): Promise<CompleteDeliveryResult> {
  const { data } = await supabase
    .from('deliveries')
    .select('status')
    .eq('id', deliveryId)
    .single();
  const status = data?.status as CompleteDeliveryResult['status'] | undefined;
  return { status: status ?? fallback };
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
