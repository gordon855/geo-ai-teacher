// One response contract for JSON and NDJSON: keep final validation identical.
export function chatResult(result, requestId) {
  return {ok:true,request_id:requestId,ai_generated:result.retrievalStrategy.startsWith('cloud_'),
    status:result.status,answer:result.answer,mode:result.taskMode,authority_mode:result.authorityMode,
    confidence:result.confidence,sources:result.sources,verbatim_verified:result.verbatimVerified,
    retrieval_strategy:result.retrievalStrategy};
}
