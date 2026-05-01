
import React, { useState } from 'react';
import { 
  Shield, 
  Key, 
  Smartphone, 
  Monitor, 
  LogOut, 
  AlertTriangle, 
  Save, 
  CheckCircle2,
  Lock,
  Globe
} from 'lucide-react';

const Security: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950">
      <div className="max-w-4xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <Shield className="text-orange-600" />
            Security & Login
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-9">Manage your password, 2FA, and active sessions.</p>
        </div>

        <div className="space-y-8">

          {/* 1. Password Change */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
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
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
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
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Confirm New Password</label>
                      <input 
                        type="password"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-all dark:text-white"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                   </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-slate-200 transition-all">
                  <Save size={16} /> Update Password
                </button>
              </div>
            </div>
          </div>

          {/* 2. Two-Factor Authentication */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
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
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
                   <div className="flex flex-col sm:flex-row gap-6 items-center">
                      <div className="w-32 h-32 bg-white p-2 rounded-lg border border-slate-200">
                         {/* Placeholder QR Code */}
                         <div className="w-full h-full bg-slate-900 pattern-grid-lg"></div> 
                      </div>
                      <div className="flex-1 space-y-3">
                         <h5 className="text-sm font-bold text-slate-800 dark:text-white">Scan this QR Code</h5>
                         <p className="text-xs text-slate-500">Open your authenticator app and scan the image to the left.</p>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Or enter code manually</label>
                            <div className="flex items-center gap-2">
                               <code className="bg-white dark:bg-slate-900 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
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
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
             <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
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
                        <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
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
                        <p className="text-sm font-bold text-slate-900 dark:text-white">iPhone 13 Pro</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                           <Globe size={12} /> Miami, FL • App • Last active 2 hours ago
                        </p>
                     </div>
                  </div>
                  <button className="text-xs font-bold text-red-600 hover:text-red-700 border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                     <LogOut size={12} /> Revoke
                  </button>
               </div>
            </div>
          </div>

          {/* 4. Danger Zone */}
          <div className="border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 rounded-2xl overflow-hidden">
             <div className="p-6 flex items-start justify-between">
                <div className="flex gap-4">
                   <div className="p-2 bg-red-100 dark:bg-red-500/20 rounded-lg text-red-600 dark:text-red-400 mt-1">
                      <AlertTriangle size={20} />
                   </div>
                   <div>
                      <h3 className="text-lg font-bold text-red-900 dark:text-red-200">Delete Account</h3>
                      <p className="text-sm text-red-700/80 dark:text-red-300/70 mt-1 max-w-lg leading-relaxed">
                         Once you delete your account, there is no going back. Please be certain. All your projects, assets, and data will be permanently removed.
                      </p>
                   </div>
                </div>
                <button className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-widest shadow-lg shadow-red-600/20 transition-all active:scale-95">
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
