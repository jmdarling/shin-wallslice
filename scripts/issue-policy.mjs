export function authorizeIssue({
  eventName,
  action,
  sender,
  author,
  permission,
  isPullRequest,
  state,
}) {
  if (isPullRequest || state !== 'open' || sender?.type !== 'User')
    return false;
  if (eventName === 'issues')
    return (
      action === 'opened' &&
      author?.login === 'jmdarling' &&
      sender.login === author.login &&
      sender.id === author.id
    );
  return (
    eventName === 'workflow_dispatch' &&
    ['admin', 'maintain', 'write'].includes(permission)
  );
}
export function issueBranch(number) {
  if (!Number.isSafeInteger(number) || number <= 0)
    throw Error('Invalid issue number');
  return `codex/issue-${number}`;
}
