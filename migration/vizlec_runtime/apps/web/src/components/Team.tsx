import React, { useMemo, useState } from 'react';
import { Copy, Link2, RefreshCw, Send, Users } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

type TeamUser = { name: string; email: string; role: string } | null | undefined;

type InviteItem = {
  id: string;
  inviteeName?: string | null;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
};

type InviteResult = {
  id: string;
  name?: string;
  email: string;
  role: string;
  status: 'created' | 'failed';
  error?: string;
  inviteLink?: string;
  inviteMessage?: string;
};

interface TeamProps {
  currentUser?: TeamUser;
}

const DEFAULT_INVITE_MESSAGE_TEMPLATE = [
  'Hi {{name}},',
  '',
  "You've been invited to join VizLec as {{role}}.",
  '',
  'Open this link to set your password and activate access:',
  '{{invite_link}}',
  '',
  'This invitation was created for {{email}} and expires at {{expires_at}}.',
  '',
  'If you were not expecting this invite, please ignore this message.'
].join('\n');

function renderInvitePreview(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (full, key: string) => {
    const normalized = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(values, normalized)) {
      return values[normalized];
    }
    return full;
  });
}

function parseRecipients(input: string): Array<{ name?: string; email: string }> {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const recipients: Array<{ name?: string; email: string }> = [];
  for (const line of lines) {
    const parts = line
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    if (parts.length === 1) {
      recipients.push({ email: parts[0] });
      continue;
    }
    recipients.push({ name: parts[0], email: parts[1] });
  }
  return recipients;
}

const Team: React.FC<TeamProps> = ({ currentUser }) => {
  const [recipientsInput, setRecipientsInput] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [expiresInHours, setExpiresInHours] = useState(72);
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_INVITE_MESSAGE_TEMPLATE);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[]>([]);
  const [history, setHistory] = useState<InviteItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const isTeamAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const parsedRecipients = useMemo(() => parseRecipients(recipientsInput), [recipientsInput]);
  const previewValues = useMemo(() => {
    const first = parsedRecipients[0];
    return {
      name: first?.name?.trim() || 'there',
      email: first?.email?.trim().toLowerCase() || 'teammate@company.com',
      role: role === 'admin' ? 'Admin' : 'Member',
      invite_link: 'https://your-vizlec-host/?invite=YOUR_TOKEN',
      expires_at: new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()
    };
  }, [parsedRecipients, role, expiresInHours]);
  const previewMessage = useMemo(
    () => renderInvitePreview(messageTemplate, previewValues),
    [messageTemplate, previewValues]
  );

  const loadHistory = () => {
    if (!isTeamAdmin) return;
    setIsLoadingHistory(true);
    apiGet<{ items: InviteItem[] }>('/team/invitations', { cacheMs: 0, dedupe: false })
      .then((res) => setHistory(res.items ?? []))
      .catch(() => setStatusMessage('Unable to load invite history.'))
      .finally(() => setIsLoadingHistory(false));
  };

  React.useEffect(() => {
    loadHistory();
  }, [isTeamAdmin]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage(`${label} copied.`);
    } catch {
      setStatusMessage(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const generateInvites = async () => {
    setStatusMessage(null);
    if (!parsedRecipients.length) {
      setStatusMessage('Add at least one recipient.');
      return;
    }
    if (!messageTemplate.trim()) {
      setStatusMessage('Message template cannot be empty.');
      return;
    }
    if (!/\{\{\s*invite_link\s*\}\}/i.test(messageTemplate)) {
      setStatusMessage('Message template must include {{invite_link}}.');
      return;
    }
    setIsGenerating(true);
    const nextResults: InviteResult[] = [];
    for (const recipient of parsedRecipients) {
      const email = recipient.email.trim().toLowerCase();
      if (!email.includes('@')) {
        nextResults.push({
          id: `${email}-${Math.random()}`,
          name: recipient.name,
          email,
          role,
          status: 'failed',
          error: 'Invalid email format.'
        });
        continue;
      }
      try {
        const res = await apiPost<{
          invitation: { id: string; email: string; role: string };
          inviteLink: string;
          inviteMessage: string;
        }>('/team/invitations', {
          email,
          role,
          expiresInHours,
          inviteeName: recipient.name ?? undefined,
          messageTemplate
        });
        nextResults.push({
          id: res.invitation.id,
          name: recipient.name,
          email: res.invitation.email,
          role: res.invitation.role,
          status: 'created',
          inviteLink: res.inviteLink,
          inviteMessage: res.inviteMessage
        });
      } catch {
        nextResults.push({
          id: `${email}-${Math.random()}`,
          name: recipient.name,
          email,
          role,
          status: 'failed',
          error: 'Unable to create invite.'
        });
      }
    }
    setResults(nextResults);
    const successCount = nextResults.filter((item) => item.status === 'created').length;
    const failCount = nextResults.length - successCount;
    setStatusMessage(`Invites generated: ${successCount} success, ${failCount} failed.`);
    setIsGenerating(false);
    loadHistory();
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      await apiPost(`/team/invitations/${inviteId}/revoke`, {});
      setHistory((prev) => prev.map((item) => (item.id === inviteId ? { ...item, status: 'revoked' } : item)));
    } catch {
      setStatusMessage('Unable to revoke invite.');
    }
  };

  const copyHistoryContent = async (inviteId: string, kind: 'link' | 'message') => {
    try {
      const res = await apiPost<{
        inviteLink: string;
        inviteMessage: string;
      }>(`/team/invitations/${inviteId}/regenerate-content`, {});
      if (kind === 'link') {
        await copyText(res.inviteLink, 'Link');
      } else {
        await copyText(res.inviteMessage, 'Message');
      }
    } catch {
      setStatusMessage('Unable to regenerate invite content.');
    }
  };

  if (!isTeamAdmin) {
    return (
      <div className="h-full overflow-y-auto custom-scrollbar bg-background">
        <div className="max-w-4xl mx-auto p-6 md:p-10 pb-24">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Users className="text-orange-600" />
            Team
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Only workspace owners and admins can manage team invitations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-5xl mx-auto p-6 md:p-10 pb-24 space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            <Users className="text-orange-600" />
            Team
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Add recipients and generate unique invite links with ready-to-share messages.
          </p>
        </div>

        <section className="bg-card border border-border rounded-[5px] shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'member')}
                className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Expires In (Hours)</label>
              <input
                type="number"
                min={1}
                max={720}
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(Math.max(1, Math.min(720, Number(e.target.value) || 72)))}
                className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Recipients Parsed</label>
              <p className="h-9 px-1 text-sm flex items-center text-foreground">
                {parsedRecipients.length}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Recipients (one per line: `name,email` or `email`)
            </label>
            <textarea
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              placeholder={`Alice Johnson,alice@company.com\nbob@company.com`}
              className="w-full min-h-[180px] border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3 py-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Invite Message Template
            </label>
            <p className="text-xs text-muted-foreground">
              Supported placeholders: <code>{'{{name}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{role}}'}</code>,{' '}
              <code>{'{{invite_link}}'}</code>, <code>{'{{expires_at}}'}</code>. <code>{'{{invite_link}}'}</code> is required.
            </p>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              className="w-full min-h-[180px] border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3 py-2"
            />
            <div className="rounded-[5px] border border-[hsl(var(--editor-input-border))] p-3 bg-background/40">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Preview</p>
              <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-sans">{previewMessage}</pre>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={generateInvites}
              disabled={isGenerating}
              className="px-4 h-9 rounded-[5px] bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-70 inline-flex items-center gap-2"
            >
              <Send size={14} />
              {isGenerating ? 'Generating...' : 'Generate Invites'}
            </button>
            {statusMessage && <p className="text-xs text-muted-foreground">{statusMessage}</p>}
          </div>
        </section>

        {results.length > 0 && (
          <section className="bg-card border border-border rounded-[5px] shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold">Generated Invites</h2>
            <div className="space-y-4">
              {results.map((result) => (
                <div key={result.id} className="rounded-[5px] border border-[hsl(var(--editor-input-border))] p-4 space-y-2">
                  <p className="text-sm font-semibold">
                    {result.name ? `${result.name} <${result.email}>` : result.email} • {result.role.toUpperCase()} • {result.status.toUpperCase()}
                  </p>
                  {result.status === 'failed' && (
                    <p className="text-xs text-red-500">{result.error ?? 'Unable to generate invite.'}</p>
                  )}
                  {result.status === 'created' && result.inviteLink && result.inviteMessage && (
                    <div className="space-y-2">
                      <p className="text-xs break-all text-muted-foreground">{result.inviteLink}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyText(result.inviteLink!, 'Link')}
                          className="px-3 h-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-xs font-bold inline-flex items-center gap-2 hover:border-primary/40"
                        >
                          <Link2 size={14} />
                          Copy Link
                        </button>
                        <button
                          onClick={() => copyText(result.inviteMessage!, 'Message')}
                          className="px-3 h-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-xs font-bold inline-flex items-center gap-2 hover:border-primary/40"
                        >
                          <Copy size={14} />
                          Copy Message
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="bg-card border border-border rounded-[5px] shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Invite History</h2>
            <button
              onClick={loadHistory}
              className="px-3 h-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-xs font-bold inline-flex items-center gap-2 hover:border-primary/40"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
          <div className="rounded-[5px] border border-[hsl(var(--editor-input-border))] divide-y divide-[hsl(var(--editor-input-border))]">
            {isLoadingHistory && <div className="p-3 text-xs text-muted-foreground">Loading history...</div>}
            {!isLoadingHistory && history.length === 0 && <div className="p-3 text-xs text-muted-foreground">No invites yet.</div>}
            {!isLoadingHistory &&
              history.map((item) => (
                <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {item.inviteeName ? `${item.inviteeName} <${item.email}>` : item.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.role.toUpperCase()} • {item.status.toUpperCase()} • Expires {new Date(item.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => copyHistoryContent(item.id, 'link')}
                          className="text-xs font-bold text-slate-600 hover:text-slate-800"
                        >
                          Copy Link
                        </button>
                        <button
                          onClick={() => copyHistoryContent(item.id, 'message')}
                          className="text-xs font-bold text-slate-600 hover:text-slate-800"
                        >
                          Copy Message
                        </button>
                        <button onClick={() => revokeInvite(item.id)} className="text-xs font-bold text-red-600 hover:text-red-700">
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Team;
