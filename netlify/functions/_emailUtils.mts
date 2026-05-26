export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function stripCrLf(s: string): string {
  return s.replace(/[\r\n]+/g, ' ');
}

const PREVIEW_MAX_CHARS = 500;

export type CommentEmailInput = {
  to: string;
  from: string;
  commenterName: string;
  shareName: string;
  shareId: string;
  body: string;
  appUrl: string;
};

export type CommentEmailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

export type InviteEmailInput = {
  to: string;
  from: string;
  inviterName: string;
  treeName: string;
  treeId: string;
  role: string;
  appUrl: string;
};

export function composeInviteEmail(opts: InviteEmailInput): CommentEmailPayload {
  const safeInviter = stripCrLf(escapeHtml(opts.inviterName));
  const safeTreeName = stripCrLf(escapeHtml(opts.treeName));
  const safeAppUrl = encodeURI(opts.appUrl);
  const safeTreeId = encodeURIComponent(opts.treeId);
  const treeUrl = `${safeAppUrl}/s/${safeTreeId}`;
  const roleLabel = opts.role === 'editor' ? 'an editor' : 'a viewer';

  return {
    from: opts.from,
    to: opts.to,
    subject: stripCrLf(`${opts.inviterName} shared "${opts.treeName}" with you`),
    html: `
        <p><strong>${safeInviter}</strong> has shared an Opportunity Solution Tree
        with you as ${roleLabel}.</p>
        <p><a href="${treeUrl}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Open "${safeTreeName}"</a></p>
        <p style="color:#666;font-size:12px;">Sign in with Google to access the tree.</p>
      `,
  };
}

export function composeCommentEmail(opts: CommentEmailInput): CommentEmailPayload {
  const safeCommenter = stripCrLf(escapeHtml(opts.commenterName));
  const safeShareName = stripCrLf(escapeHtml(opts.shareName));
  const safeAppUrl = encodeURI(opts.appUrl);
  const safeShareId = encodeURIComponent(opts.shareId);
  const shareUrl = `${safeAppUrl}/s/${safeShareId}`;

  const truncated = opts.body.length > PREVIEW_MAX_CHARS;
  const previewSource = truncated ? opts.body.slice(0, PREVIEW_MAX_CHARS) : opts.body;
  const safeBody = escapeHtml(previewSource).replace(/\n/g, '<br>');
  const previewBlock = truncated
    ? `${safeBody}…<br><a href="${shareUrl}">View full comment</a>`
    : safeBody;

  return {
    from: opts.from,
    to: opts.to,
    subject: stripCrLf(`${opts.commenterName} commented on "${opts.shareName}"`),
    html: `
        <p><strong>${safeCommenter}</strong> commented on your OST
        "<a href="${shareUrl}">${safeShareName}</a>":</p>
        <blockquote style="border-left: 3px solid #ddd; padding-left: 12px; color: #444;">
          ${previewBlock}
        </blockquote>
        <p><a href="${shareUrl}">View on OST Builder</a></p>
      `,
  };
}
