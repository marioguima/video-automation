
import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  Smartphone, 
  Monitor, 
  LogOut, 
  AlertTriangle, 
  Save, 
  Globe,
  Copy,
  Link2,
  UserPlus
} from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

type InviteItem = {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
};

interface SecurityProps {
  currentUser?: { name: string; email: string; role: string } | null;
}

const Security: React.FC<SecurityProps> = ({ currentUser }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteHours, setInviteHours] = useState(72);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(false);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const isTeamAdmin = currentUser?.role === 'owner' || currentUser?.role === 'admin';

  const loadInvites = () => {
    if (!isTeamAdmin) return;
    setIsLoadingInvites(true);
    apiGet<{ items: InviteItem[] }>('/team/invitations', { cacheMs: 0, dedupe: false })
      .then((res) => {
        setInvites(res.items ?? []);
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => {
        setIsLoadingInvites(false);
      });
  };

  React.useEffect(() => {
    loadInvites();
  }, [isTeamAdmin]);

  const handleCreateInvite = async () => {
    setInviteStatus(null);
    if (!inviteEmail.includes('@')) {
      setInviteStatus('Enter a valid email.');
      return;
    }
    setIsCreatingInvite(true);
    try {
      const res = await apiPost<{
        inviteLink: string;
        inviteMessage: string;
        invitation: InviteItem;
      }>('/team/invitations', {
        email: inviteEmail,
        role: inviteRole,
        expiresInHours: inviteHours
      });
      setInviteLink(res.inviteLink);
      setInviteMessage(res.inviteMessage);
      setInviteStatus('Invite created successfully.');
      setInviteEmail('');
      setInvites((prev) => [res.invitation, ...prev]);
    } catch (err) {
      console.error(err);
      setInviteStatus('Unable to create invite.');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setInviteStatus(`${label} copied.`);
    } catch {
      setInviteStatus(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    try {
      await apiPost(`/team/invitations/${invitationId}/revoke`, {});
      setInvites((prev) =>
        prev.map((item) => (item.id === invitationId ? { ...item, status: 'revoked' } : item))
      );
    } catch (err) {
      console.error(err);
      setInviteStatus('Unable to revoke invite.');
    }
  };

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <Shield className="text-orange-600" />
            Security & Login
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-9">Manage your password, 2FA, and active sessions.</p>
        </div>

        <div className="space-y-8">
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-orange-100 dark:bg-orange-500/10 rounded-[5px] text-orange-600 dark:text-orange-400">
                <UserPlus size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Team Invites</h2>
                <p className="text-xs text-slate-500">Create invitation links and share them manually.</p>
              </div>
            </div>

            <div className="p-8 space-y-5">
              {!isTeamAdmin && (
                <div className="text-sm text-muted-foreground">
                  Only owners and admins can manage invitations.
                </div>
              )}

              {isTeamAdmin && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Invite Email</label>
                      <input
                        type="email"
                        className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                        placeholder="member@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Role</label>
                      <select
                        className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                        value={inviteRole}
                        onChange={(e) => setInviteRole((e.target.value === 'admin' ? 'admin' : 'member'))}
                      >
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Expires in (hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      className="w-24 border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                      value={inviteHours}
                      onChange={(e) => setInviteHours(Math.max(1, Math.min(720, Number(e.target.value) || 72)))}
                    />
                    <button
                      onClick={handleCreateInvite}
                      disabled={isCreatingInvite}
                      className="px-4 h-9 rounded-[5px] bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-200 transition-all disabled:opacity-70"
                    >
                      {isCreatingInvite ? 'Creating...' : 'Create Invite'}
                    </button>
                  </div>

                  {inviteLink && (
                    <div className="space-y-3 rounded-[5px] border border-[hsl(var(--editor-input-border))] p-4 bg-[hsl(var(--editor-input))]">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Invite Link</p>
                        <div className="text-xs text-foreground break-all">{inviteLink}</div>
                        <button
                          onClick={() => handleCopy(inviteLink, 'Link')}
                          className="mt-2 inline-flex items-center gap-2 px-3 h-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-xs font-bold hover:border-primary/40"
                        >
                          <Link2 size={14} /> Copy Link
                        </button>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Invite Message</p>
                        <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{inviteMessage}</pre>
                        <button
                          onClick={() => handleCopy(inviteMessage, 'Message')}
                          className="mt-2 inline-flex items-center gap-2 px-3 h-8 rounded-[5px] border border-[hsl(var(--editor-input-border))] text-xs font-bold hover:border-primary/40"
                        >
                          <Copy size={14} /> Copy Message
                        </button>
                      </div>
                    </div>
                  )}

                  {inviteStatus && <p className="text-xs text-muted-foreground">{inviteStatus}</p>}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Invites</p>
                      <button onClick={loadInvites} className="text-xs text-orange-600 font-bold">Refresh</button>
                    </div>
                    <div className="border border-[hsl(var(--editor-input-border))] rounded-[5px] divide-y divide-[hsl(var(--editor-input-border))]">
                      {isLoadingInvites && <div className="p-3 text-xs text-muted-foreground">Loading invites...</div>}
                      {!isLoadingInvites && invites.length === 0 && (
                        <div className="p-3 text-xs text-muted-foreground">No invites yet.</div>
                      )}
                      {!isLoadingInvites && invites.map((item) => (
                        <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{item.email}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.role.toUpperCase()} • {item.status.toUpperCase()} • Expires {new Date(item.expiresAt).toLocaleString()}
                            </p>
                          </div>
                          {item.status === 'pending' && (
                            <button
                              onClick={() => handleRevokeInvite(item.id)}
                              className="text-xs font-bold text-red-600 hover:text-red-700"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 1. Password Change */}
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-[5px] text-slate-600 dark:text-slate-400">
                <Key size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Change Password</h2>
                <p className="text-xs text-slate-500">Ensure your account is using a long, random password to stay secure.</p>
              </div>
            </div>

            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Current Password</label>
                  <input 
                    type="password"
                    className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                    placeholder="••••••••"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">New Password</label>
                      <input 
                        type="password"
                        className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Confirm New Password</label>
                      <input 
                        type="password"
                        className="w-full border rounded-[5px] text-sm outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground px-3"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                   </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button className="flex items-center gap-2 px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[5px] text-xs font-bold uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-200 transition-all h-9">
                  <Save size={16} /> Update Password
                </button>
              </div>
            </div>
          </div>

          {/* 2. Two-Factor Authentication */}
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-[5px] text-indigo-600 dark:text-indigo-400">
                <Smartphone size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Two-Factor Authentication</h2>
                <p className="text-xs text-slate-500">Add an extra layer of security to your account.</p>
              </div>
            </div>

            <div className="p-8">
              <div className="flex items-center justify-between">
                 <div className="max-w-lg">
                    <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-1">Authenticator App</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Use an authenticator app like Google Authenticator or Authy to generate verification codes.
                    </p>
                 </div>
                 <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold uppercase tracking-wider ${is2FAEnabled ? 'text-green-600' : 'text-slate-400'}`}>
                      {is2FAEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button 
                      onClick={() => setIs2FAEnabled(!is2FAEnabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${is2FAEnabled ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform duration-300 ${is2FAEnabled ? 'translate-x-6' : ''}`}></div>
                    </button>
                 </div>
              </div>

              {is2FAEnabled && (
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-[5px] border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
                   <div className="flex flex-col sm:flex-row gap-6 items-center">
                      <div className="w-32 h-32 bg-white p-2 rounded-[5px] border border-slate-200">
                         {/* Placeholder QR Code */}
                         <div className="w-full h-full bg-slate-900 pattern-grid-lg"></div> 
                      </div>
                      <div className="flex-1 space-y-3">
                         <h5 className="text-sm font-bold text-slate-800 dark:text-white">Scan this QR Code</h5>
                         <p className="text-xs text-slate-500">Open your authenticator app and scan the image to the left.</p>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or enter code manually</label>
                            <div className="flex items-center gap-2">
                               <code className="bg-card px-3 py-1.5 rounded-[5px] border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                                 H7J2 K9L1 M4N5 P8Q3
                               </code>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Active Sessions */}
          <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-[hsl(var(--secondary))]/60">
              <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-[5px] text-blue-600 dark:text-blue-400">
                <Monitor size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-white">Active Sessions</h2>
                <p className="text-xs text-slate-500">Devices where you are currently logged in.</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
               {/* Current Session */}
               <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500">
                        <Monitor size={20} />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-foreground flex items-center gap-2">
                           Macbook Pro 16" <span className="text-[10px] bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-bold uppercase">Current</span>
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                           <Globe size={12} /> Tampa, FL • Chrome • 192.168.1.1
                        </p>
                     </div>
                  </div>
               </div>

               {/* Other Session */}
               <div className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500">
                        <Smartphone size={20} />
                     </div>
                     <div>
                        <p className="text-sm font-bold text-foreground">iPhone 13 Pro</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                           <Globe size={12} /> Miami, FL • App • Last active 2 hours ago
                        </p>
                     </div>
                  </div>
                  <button className="text-xs font-bold text-red-600 hover:text-red-700 border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 px-3 rounded-[5px] transition-colors flex items-center gap-1 h-9">
                     <LogOut size={12} /> Revoke
                  </button>
               </div>
            </div>
          </div>

          {/* 4. Danger Zone */}
          <div className="border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-[5px] overflow-hidden">
             <div className="p-6 flex items-start justify-between">
                <div className="flex gap-4">
                   <div className="p-2 bg-red-100 dark:bg-red-500/20 rounded-[5px] text-red-600 dark:text-red-400 mt-1">
                      <AlertTriangle size={20} />
                   </div>
                   <div>
                      <h3 className="text-lg font-bold text-red-900 dark:text-red-200">Delete Account</h3>
                      <p className="text-sm text-red-700/80 dark:text-red-300/70 mt-1 max-w-lg leading-relaxed">
                         Once you delete your account, there is no going back. Please be certain. All your projects, assets, and data will be permanently removed.
                      </p>
                   </div>
                </div>
                <button className="px-6 bg-red-600 hover:bg-red-700 text-white rounded-[5px] text-xs font-bold uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all active:scale-95 h-9">
                   Delete Account
                </button>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Security;
