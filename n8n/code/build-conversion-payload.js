// Embedded verbatim in the n8n Code node by scripts/sync-capi-workflow.mjs.
// Dates come from the immutable event outbox. Never replace an old date with now.
return $input.all().map((item, index) => {
  const d = item.json;
  const messaging = d.action_source === 'business_messaging';
  const validEvent = messaging
    ? ['LeadSubmitted', 'QualifiedLead'].includes(d.event_name)
    : d.action_source === 'other' && d.event_name === 'VehicleAcquired';
  if (!validEvent || !d.event_id || !d.dataset_id || !Number.isSafeInteger(Number(d.event_time))) {
    throw new Error('Fila incompatível: instale a migração conversion_event_outbox antes de ativar este workflow.');
  }
  const source = d.user_data ?? {};
  const userData = messaging
    ? { ctwa_clid: source.ctwa_clid, whatsapp_business_account_id: source.whatsapp_business_account_id }
    : { ph: source.ph };
  if (messaging ? !userData.ctwa_clid || !userData.whatsapp_business_account_id
    : !Array.isArray(userData.ph) || !userData.ph.every((hash) => /^[a-f0-9]{64}$/.test(hash)) || !userData.ph.length) {
    throw new Error('Evento sem identificadores válidos.');
  }
  const event = {
    event_name: d.event_name,
    event_time: Number(d.event_time),
    event_id: d.event_id,
    action_source: d.action_source,
    user_data: userData,
  };
  if (messaging) event.messaging_channel = 'whatsapp';
  // Acquisition cost is not revenue. Never send debt, notes or vehicle details.
  return { json: {
    lead_id: d.lead_id,
    event_id: d.event_id,
    url: `https://graph.facebook.com/v26.0/${d.dataset_id}/events`,
    access_token: d.access_token,
    corpo: { data: [event] },
  }, pairedItem: { item: index } };
});
