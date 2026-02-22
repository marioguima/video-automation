
import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  MapPin, 
  Globe, 
  Camera, 
  CreditCard, 
  Check, 
  Shield, 
  Zap,
  Save,
  Calendar,
  Share2,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

const UserProfile: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'details' | 'billing'>('details');

  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-8 pb-24">
        
        {/* Profile Header Card */}
        <div className="bg-card rounded-[5px] border border-border shadow-sm overflow-hidden mb-8">
            
            {/* Cover Image Area (Clean, no text) */}
            <div className="h-44 md:h-56 w-full bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 relative group">
                {/* Subtle pattern overlay */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
                
                {/* Edit Cover Button */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="px-3 bg-black/20 hover:bg-black/40 backdrop-blur-md text-white text-xs font-bold rounded-[5px] transition-all flex items-center gap-2 border border-white/10 h-9">
                        <Camera size={14} /> Edit Cover
                    </button>
                </div>
            </div>

            {/* Profile Content Body */}
            <div className="px-8 relative">
                
                {/* Top Row: Avatar Left, Actions Right */}
                <div className="flex justify-between items-end -mt-16 mb-5">
                    {/* Avatar */}
                    <div className="relative group p-1 bg-card rounded-[5px]">
                        <div className="w-32 h-32 rounded-[5px] overflow-hidden relative z-10 bg-slate-100 dark:bg-slate-800">
                            <img 
                                src="/avatar-placeholder.svg" 
                                alt="Profile" 
                                className="w-full h-full object-cover"
                            />
                        </div>
                        <button className="absolute bottom-2 right-2 z-20 p-2 bg-slate-900 text-white rounded-full hover:bg-orange-600 transition-colors shadow-lg border border-white dark:border-slate-800 opacity-0 group-hover:opacity-100 h-9">
                           <Camera size={14} />
                        </button>
                    </div>

                    {/* Action Buttons - Aligned to bottom of cover area roughly */}
                    <div className="flex items-center gap-3 mb-2">
                         <button className="px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-[5px] text-xs font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-2 h-9">
                            <Share2 size={14} /> <span className="hidden sm:inline">Share</span>
                         </button>
                         <button className="px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-[5px] text-xs font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2 h-9">
                            <ExternalLink size={14} /> Public View
                         </button>
                    </div>
                </div>

                {/* User Info - Now clearly in the dark/light body area */}
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-1">
                        <h1 className="text-3xl font-bold text-foreground tracking-tight">John Cena</h1>
                        <span className="px-2 py-0.5 rounded-[5px] bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase tracking-wide border border-blue-100 dark:border-blue-500/20 flex items-center gap-1.5">
                            <CheckCircle2 size={12} fill="currentColor" className="text-blue-600 dark:text-blue-400" /> Verified
                        </span>
                    </div>
                    
                    <p className="text-muted-foreground font-medium text-base mb-4 flex items-center gap-2">
                       Senior Content Creator <span className="text-slate-300 dark:text-slate-600">•</span> <span className="text-orange-600 dark:text-orange-500">@john_cena</span>
                    </p>
                    
                    {/* Meta Data */}
                    <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-muted-foreground">
                        <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-slate-400 dark:text-slate-500" />
                            Tampa, FL
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe size={16} className="text-slate-400 dark:text-slate-500" />
                            <a href="#" className="hover:text-orange-600 transition-colors underline decoration-slate-300 dark:decoration-slate-700 underline-offset-2">johncena.com</a>
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar size={16} className="text-slate-400 dark:text-slate-500" />
                            Joined March 2022
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-8 border-t border-slate-100 dark:border-slate-800">
                    <button 
                        onClick={() => setActiveTab('details')}
                        className={`py-4 text-xs font-bold uppercase tracking-widest transition-all border-t-2 -mt-[1px] ${
                        activeTab === 'details' 
                            ? 'border-orange-600 text-orange-600' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                    >
                        Overview
                    </button>
                    <button 
                        onClick={() => setActiveTab('billing')}
                        className={`py-4 text-xs font-bold uppercase tracking-widest transition-all border-t-2 -mt-[1px] ${
                        activeTab === 'billing' 
                            ? 'border-orange-600 text-orange-600' 
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                        }`}
                    >
                        Billing & Plans
                    </button>
                </div>
            </div>
        </div>

        {/* Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column (Form) */}
          <div className="lg:col-span-2 space-y-6">
            {activeTab === 'details' ? (
              <div className="bg-card border border-border rounded-[5px] p-8 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                   <h3 className="text-lg font-bold text-slate-800 dark:text-white">Personal Information</h3>
                   <button className="px-4 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-[5px] text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all h-9">
                      <Save size={16} /> Save Changes
                   </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        defaultValue="John Cena"
                        className="w-full pl-10 pr-4 border rounded-[5px] text-sm font-medium outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        defaultValue="john.cena@wwe.com"
                        className="w-full pl-10 pr-4 border rounded-[5px] text-sm font-medium outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Role / Job Title</label>
                    <div className="relative">
                      <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        defaultValue="Senior Content Creator"
                        className="w-full pl-10 pr-4 border rounded-[5px] text-sm font-medium outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input 
                        defaultValue="Tampa, Florida"
                        className="w-full pl-10 pr-4 border rounded-[5px] text-sm font-medium outline-none focus:border-primary/40 transition-all h-9 bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bio</label>
                  <textarea 
                    rows={4}
                    defaultValue="Professional wrestler turned actor and content creator. I can't be seen, but my content is highly visible."
                    className="w-full p-4 border rounded-[5px] text-sm font-medium outline-none focus:border-primary/40 transition-all resize-none bg-[hsl(var(--editor-input))] border-[hsl(var(--editor-input-border))] text-foreground"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-[5px] p-8 shadow-xl relative overflow-hidden border border-slate-700">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                  
                  <div className="flex items-start justify-between mb-8 relative">
                    <div>
                      <p className="text-orange-500 font-bold uppercase tracking-widest text-xs mb-1">Current Plan</p>
                      <h2 className="text-3xl font-bold">Pro Creator</h2>
                      <p className="text-slate-400 text-sm mt-2">Billed annually • Next payment on Dec 24, 2024</p>
                    </div>
                    <div className="bg-white/10 p-3 rounded-[5px] backdrop-blur-sm">
                      <Zap size={24} className="text-orange-500 fill-orange-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 relative">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Check size={16} className="text-green-500" /> Unlimited Projects
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Check size={16} className="text-green-500" /> 4K Rendering
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Check size={16} className="text-green-500" /> AI Voice Cloning (Pro)
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                      <Check size={16} className="text-green-500" /> Priority Support
                    </div>
                  </div>
                </div>

                <div className="bg-card border border-border rounded-[5px] p-8 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6">Payment Methods</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-[5px] border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-8 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                          <CreditCard size={18} className="text-slate-600 dark:text-slate-300" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-800 dark:text-white">Visa ending in 4242</p>
                          <p className="text-xs text-slate-500">Expiry 12/2028</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded dark:bg-green-500/10 dark:text-green-400">Default</span>
                    </div>

                    <button className="w-full border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[5px] text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-orange-600 hover:border-orange-500/30 transition-all h-9">
                      + Add Payment Method
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column (Status) */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-[5px] p-6 shadow-sm">
              <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Profile Completeness</h4>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-green-500 w-[85%]"></div>
              </div>
              <p className="text-xs text-muted-foreground font-medium mb-6">Your profile is 85% complete. Add your social links to reach 100%.</p>
              
              <div className="space-y-3">
                 <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span className="line-through opacity-60">Upload Avatar</span>
                 </div>
                 <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600">
                      <Check size={12} strokeWidth={3} />
                    </div>
                    <span className="line-through opacity-60">Confirm Email</span>
                 </div>
                 <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      <Globe size={12} />
                    </div>
                    <span>Connect Social Accounts</span>
                 </div>
              </div>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30 rounded-[5px] p-6">
              <h4 className="text-sm font-bold text-orange-800 dark:text-orange-200 mb-2">Upgrade to Team</h4>
              <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mb-4 leading-relaxed">
                Unlock collaborative features and shared assets by upgrading to a Team Workspace.
              </p>
              <button className="w-full bg-orange-600 text-white text-xs font-bold rounded-[5px] shadow-lg shadow-orange-600/20 hover:bg-orange-700 transition-all h-9">
                View Team Plans
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default UserProfile;
