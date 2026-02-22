
import React from 'react';
import { 
  CreditCard, 
  Check, 
  Zap, 
  Download, 
  Plus, 
  Clock, 
  ShieldCheck, 
  AlertCircle,
  MoreHorizontal
} from 'lucide-react';

const Billing: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-6xl mx-auto p-6 md:p-10 pb-24">
        
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Billing & Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your subscription, payment methods, and download invoices.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column (Plan & Payment) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Current Plan Card */}
            <div className="bg-card border border-border rounded-[5px] p-8 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-orange-600/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
              
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 relative z-10 mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-orange-600 font-bold uppercase tracking-widest text-xs">Current Plan</p>
                    <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] font-bold border border-green-200 dark:border-green-500/30">Active</span>
                  </div>
                  <h2 className="text-4xl font-bold text-foreground mb-2">Pro Creator</h2>
                  <p className="text-muted-foreground text-sm">
                    Billed annually <span className="text-slate-300 dark:text-slate-600 mx-1">•</span> Next payment on <span className="font-bold text-slate-700 dark:text-slate-200">Dec 24, 2024</span>
                  </p>
                </div>
                <div className="text-right">
                  <h3 className="text-3xl font-bold text-foreground">$29<span className="text-base text-slate-400 font-medium">/mo</span></h3>
                </div>
              </div>

              {/* Usage Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-background/50 p-6 rounded-[5px] border border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
                    <span>Video Minutes</span>
                    <span className="text-foreground">82% Used</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-orange-500 w-[82%] rounded-full"></div>
                  </div>
                  <p className="text-[10px] text-slate-400 text-right">410 / 500 mins</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
                    <span>Storage</span>
                    <span className="text-foreground">45% Used</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-[45%] rounded-full"></div>
                  </div>
                  <p className="text-[10px] text-slate-400 text-right">45 / 100 GB</p>
                </div>
              </div>

              {/* Features List */}
              <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <Check size={16} className="text-green-500 flex-shrink-0" /> Unlimited Projects
                </div>
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <Check size={16} className="text-green-500 flex-shrink-0" /> 4K Rendering
                </div>
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <Check size={16} className="text-green-500 flex-shrink-0" /> AI Voice Cloning (Pro)
                </div>
                <div className="flex items-center gap-2.5 text-sm font-medium text-slate-600 dark:text-slate-300">
                  <Check size={16} className="text-green-500 flex-shrink-0" /> Priority Support
                </div>
              </div>

              <div className="flex gap-4">
                 <button className="px-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-[5px] text-xs font-bold uppercase tracking-wider hover:bg-slate-800 dark:hover:bg-slate-200 transition-all h-9">
                    Change Plan
                 </button>
                 <button className="px-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-[5px] text-xs font-bold uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-700 transition-all h-9">
                    Cancel Subscription
                 </button>
              </div>
            </div>

            {/* Billing History */}
            <div className="bg-card border border-border rounded-[5px] shadow-sm overflow-hidden">
               <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-foreground">Billing History</h3>
                  <button className="text-xs font-bold text-orange-600 hover:text-orange-700 uppercase tracking-wide h-9">Download All</button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead className="bg-background/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                       <tr>
                          <th className="px-6 py-4">Invoice</th>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Amount</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Action</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                       {[
                         { id: 'INV-001', date: 'Dec 24, 2023', amount: '$29.00', status: 'Paid' },
                         { id: 'INV-002', date: 'Nov 24, 2023', amount: '$29.00', status: 'Paid' },
                         { id: 'INV-003', date: 'Oct 24, 2023', amount: '$29.00', status: 'Paid' },
                       ].map((inv) => (
                         <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">{inv.id}</td>
                            <td className="px-6 py-4 text-slate-500">{inv.date}</td>
                            <td className="px-6 py-4 font-medium text-foreground">{inv.amount}</td>
                            <td className="px-6 py-4">
                               <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400">
                                 <Check size={10} strokeWidth={4} /> {inv.status}
                               </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-[5px] text-slate-400 hover:text-orange-600 transition-all h-9">
                                  <Download size={16} />
                               </button>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
            </div>
          </div>

          {/* Right Column (Payment Methods & Address) */}
          <div className="space-y-8">
            
            {/* Payment Method */}
            <div className="bg-card border border-border rounded-[5px] p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">Payment Method</h3>
                <button className="text-xs font-bold text-orange-600 hover:text-orange-700 uppercase tracking-wide flex items-center gap-1 h-9">
                   <Plus size={14} /> Add New
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-[5px] border border-orange-200 dark:border-orange-500/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-orange-500/10 rounded-full -mr-8 -mt-8"></div>
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-12 h-8 bg-white dark:bg-slate-700 rounded-[5px] border border-slate-200 dark:border-slate-600 flex items-center justify-center">
                      <CreditCard size={18} className="text-slate-600 dark:text-slate-300" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-foreground flex items-center gap-2">
                        Visa ending in 4242
                      </p>
                      <p className="text-xs text-slate-500">Expiry 12/2028</p>
                    </div>
                  </div>
                  <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 h-9">
                     <MoreHorizontal size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-card rounded-[5px] border border-border opacity-60 hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-8 bg-slate-100 dark:bg-slate-800 rounded-[5px] border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <CreditCard size={18} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Mastercard ending in 8832</p>
                      <p className="text-xs text-slate-500">Expiry 08/2025</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Billing Address */}
            <div className="bg-card border border-border rounded-[5px] p-6 shadow-sm">
               <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">Billing Address</h3>
                <button className="text-xs font-bold text-slate-400 hover:text-orange-600 uppercase tracking-wide h-9">Edit</button>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                 <p className="font-bold text-foreground">John Cena</p>
                 <p>123 Wrestling Blvd.</p>
                 <p>Tampa, FL 33602</p>
                 <p>United States</p>
              </div>
              
              <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                 <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-[5px] text-slate-500">
                       <ShieldCheck size={18} />
                    </div>
                    <div>
                       <p className="text-xs font-bold text-foreground">Secure Payment Processing</p>
                       <p className="text-[10px] text-slate-500">Encrypted via Stripe 256-bit SSL</p>
                    </div>
                 </div>
              </div>
            </div>

            {/* Need Help? */}
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-[5px] p-6">
               <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div>
                     <h4 className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-1">Need help with billing?</h4>
                     <p className="text-xs text-blue-600/80 dark:text-blue-300/70 mb-3 leading-relaxed">
                        Contact our dedicated support team for any questions regarding your invoice or subscription.
                     </p>
                     <button className="text-xs font-bold text-blue-700 dark:text-blue-300 underline h-9">Contact Support</button>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Billing;
