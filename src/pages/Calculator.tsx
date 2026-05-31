import { useState } from 'react';
import { ArrowRightLeft, Download, Landmark, Sparkles, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function CalculatorPage() {
    const { t, i18n } = useTranslation();
    const isArabic = i18n.language?.toLowerCase().startsWith('ar');
    const [unitPrice, setUnitPrice] = useState(5000000);
    const [downPayment, setDownPayment] = useState(10);
    const [years, setYears] = useState(8);

    const totalDownPayment = (unitPrice * downPayment) / 100;
    const remainingAmount = unitPrice - totalDownPayment;
    const monthlyInstallment = remainingAmount / (years * 12);
    const quarterlyInstallment = remainingAmount / (years * 4);

    return (
        <div className={`p-4 md:p-8 space-y-10 ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-10 rounded-[3rem] border border-slate-50 shadow-sm gap-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px]" />
                <div className="relative z-10">
                    <h1 className="text-3xl font-black text-[#0B1828]">{t('calculator.smartCenterTitle')}</h1>
                    <p className={`text-sm font-bold text-slate-400 mt-1 uppercase tracking-widest flex items-center gap-2 ${isArabic ? 'justify-end' : 'justify-start'}`}>
                        {t('calculator.financialPlanningSubtitle')} <Sparkles size={14} className="text-[#BF9B30]" />
                    </p>
                </div>
                <div className="flex gap-4 relative z-10">
                    <button className="bg-slate-50 text-slate-500 px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-slate-100 transition-all">
                        <Download size={18} /> {t('calculator.downloadFinancialOffer')}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-[#0B1828] p-10 rounded-[3.5rem] shadow-2xl text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl" />
                        <h3 className={`text-[10px] font-black uppercase tracking-widest text-slate-400 mb-10 flex items-center gap-2 ${isArabic ? 'border-r-4 pr-3' : 'border-l-4 pl-3'} border-[#BF9B30]`}>
                            {t('calculator.unitInputsHeading')}
                        </h3>

                        <div className="space-y-8 relative z-10 font-sans">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('calculator.totalPriceEgpLabel')}</label>
                                <input
                                    type="number"
                                    value={unitPrice}
                                    onChange={(e) => setUnitPrice(Number(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-xl font-black text-[#BF9B30] outline-none focus:border-[#BF9B30] transition-all"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('calculator.downPaymentRatioLabel')}</label>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="range"
                                        min="0"
                                        max="50"
                                        step="5"
                                        value={downPayment}
                                        onChange={(e) => setDownPayment(Number(e.target.value))}
                                        className="flex-1 accent-[#BF9B30]"
                                    />
                                    <span className="w-16 text-center font-black text-xl">{downPayment}%</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('calculator.installmentYearsLabel')}</label>
                                <select
                                    value={years}
                                    onChange={(e) => setYears(Number(e.target.value))}
                                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-sm font-black outline-none focus:border-[#BF9B30]"
                                >
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15].map((y) => (
                                        <option key={y} value={y} className="text-[#0B1828]">
                                            {t('calculator.yearsOption', { count: y })}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="bg-emerald-500 rounded-[2.5rem] p-10 text-white shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 p-10 opacity-10 group-hover:scale-125 transition-transform">
                            <Landmark size={80} />
                        </div>
                        <h4 className="text-sm font-black mb-2 relative z-10">{t('calculator.promoTitle')}</h4>
                        <p className="text-[10px] font-bold text-white/70 relative z-10 leading-relaxed">
                            {t('calculator.promoDescription')}
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white rounded-[3.5rem] p-12 border border-slate-50 shadow-sm relative overflow-hidden h-full flex flex-col">
                        <div className="flex items-center justify-between mb-12 border-b border-slate-50 pb-8">
                            <h2 className="text-2xl font-black text-[#0B1828]">{t('calculator.targetOfferAnalysis')}</h2>
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                                <TrendingUp size={24} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-10">
                                <div className="bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('calculator.downPaymentAmountLabel')}</p>
                                    <p className="text-3xl font-black text-[#0B1828] tracking-tighter">{totalDownPayment.toLocaleString()} <span className="text-sm text-slate-400">EGP</span></p>
                                </div>
                                <div className="bg-slate-50/50 p-8 rounded-[2.5rem] border border-slate-50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('calculator.remainingAmountLabel')}</p>
                                    <p className="text-3xl font-black text-blue-600 tracking-tighter">{remainingAmount.toLocaleString()} <span className="text-sm text-slate-400">EGP</span></p>
                                </div>
                            </div>

                            <div className="space-y-8 bg-[#0B1828] p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#BF9B30]/10 rounded-full blur-3xl" />
                                <h3 className={`text-base font-black mb-8 ${isArabic ? 'border-r-4 pr-3' : 'border-l-4 pl-3'} border-[#BF9B30]`}>{t('calculator.installmentPlanTitle')}</h3>
                                <div className="space-y-8">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('calculator.monthlyInstallmentLabel')}</p>
                                        <p className="text-3xl font-black text-[#BF9B30] tracking-tighter">{Math.round(monthlyInstallment).toLocaleString()} <span className="text-sm">EGP</span></p>
                                    </div>
                                    <div className="pt-8 border-t border-white/5">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('calculator.quarterlyInstallmentLabel')}</p>
                                        <p className="text-2xl font-black tracking-tighter">{Math.round(quarterlyInstallment).toLocaleString()} <span className="text-sm">EGP</span></p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-auto pt-10 flex flex-col md:flex-row gap-4">
                            <button className="flex-1 py-5 bg-[#0B1828] text-white rounded-2xl font-black text-xs shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                                <ArrowRightLeft size={18} /> {t('calculator.compareAnotherOffer')}
                            </button>
                            <button className="flex-1 py-5 bg-white border-2 border-slate-100 text-[#0B1828] rounded-2xl font-black text-xs hover:bg-slate-50 transition-all">
                                {t('calculator.printAsPdf')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

