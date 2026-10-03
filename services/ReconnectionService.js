import { supabase } from '../lib/supabase';

// Phase 4 uses interactions as the single discovery state store.
export const RECONNECTION_PHASES = { SHOWN_HINTS: 'SHOWN_HINTS', REVEAL_PENDING: 'BOTH_REVEALS_PENDING', RECONNECTED: 'RECONNECTED', TERMINATED: 'TERMINATED', EXPIRED: 'EXPIRED' };

export async function fetchMyReconnections() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase.from('interactions')
    .select('id,sender_id,receiver_id,phase,hint_payload,zone_id,created_at,phase_updated_at,reconnect_started_at,sender_revealed,receiver_revealed')
    .eq('interaction_type', 'mutual_discovery')
    .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
    .in('phase', ['SHOWN_HINTS', 'BOTH_REVEALS_PENDING', 'RECONNECTED'])
    .order('phase_updated_at', { ascending: false });
  if (error) throw error;
  const partnerIds = [...new Set((data || []).map(item => item.sender_id === user.id ? item.receiver_id : item.sender_id))];
  const { data: profiles, error: profileError } = partnerIds.length ? await supabase.from('profiles').select('id,name,username,avatar_url').in('id', partnerIds) : { data: [], error: null };
  if (profileError) throw profileError;
  return (data || []).map(item => ({ ...item, participant_a: item.sender_id, participant_b: item.receiver_id, base_reward: 0,
    partner: (profiles || []).find(profile => profile.id === (item.sender_id === user.id ? item.receiver_id : item.sender_id)) }));
}

export async function createReconnectionForInteraction(interactionId) {
  const { data, error } = await supabase.rpc('mark_discovery_hints_seen', { p_interaction_id: interactionId });
  if (error) throw error;
  return data;
}
export async function continueReconnection(interactionId) { 
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('mark_user_revealed', { p_interaction_id: interactionId, p_user_id: user.id }); 
  if (error) throw error; 
  return data; 
}
export async function cancelReconnection(interactionId) { 
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('terminate_reconnect', { p_interaction_id: interactionId, p_actor_id: user.id, p_reason: 'USER_CANCELLED' }); 
  if (error) throw error; 
  return data; 
}
