import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Login as LoginAPI } from "../services/api";
import { Loader2, EyeOff, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import { login as loginAction } from "../redux/UserSlice";
import { useMutation } from "@tanstack/react-query";
import type { LoginRequest } from "../Interfaces/auth";
import { useTranslation } from "react-i18next";
import siraLogo from "../assets/logo.png";

interface ValidationErrors {
  email?: string;
  password?: string;
}

const Login = () => {
  const [loginInput, setLoginInput] = useState({ email: "", password: "" });
  const [loginErrors, setLoginErrors] = useState<ValidationErrors>({});
  const [showPassword, setShowPassword] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { t, i18n } = useTranslation();
  const language: "en" | "ar" = i18n.language?.toLowerCase().startsWith("ar") ? "ar" : "en";

  const navigate = useNavigate();
  const dispatch = useDispatch();

  const validateEmail = (email: string): string | null => {
    if (!email) return language === "en" ? "Email is required" : "البريد الإلكترونى مطلوب";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return language === "en" ? "Invalid email address" : "البريد الإلكتروني غير صالح";
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password) return language === "en" ? "Password is required" : "كلمة المرور مطلوبة";
    if (password.length < 8)
      return language === "en" ? "Password must be at least 8 characters" : "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل";
    return null;
  };

  const validateLoginForm = (values: { email: string; password: string }): boolean => {
    const errors: ValidationErrors = {};
    const emailError = validateEmail(values.email);
    const passwordError = validatePassword(values.password);
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    setLoginErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => LoginAPI(data),
    onSuccess: (data) => {
      toast.success(data?.message || t("auth.loginSuccess"));
      dispatch(loginAction({ user: data?.user, token: data?.access_token }));
      setLoginInput({ email: "", password: "" });
      setLoginErrors({});
      const roleName = data?.user?.role?.name;
      if (roleName === "marketing") navigate("/units");
      else navigate("/");
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      const apiMessage = error?.response?.data?.message;
      if (!error?.response) { toast.error(t("auth.serverUnavailable")); return; }
      if (status === 401) { toast.error(t("auth.invalidCredentials")); return; }
      toast.error(apiMessage || t("auth.loginFailed"));
    },
  });

  const changeLoginInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target as { name: keyof typeof loginInput; value: string };
    setLoginInput((prev) => ({ ...prev, [name]: value }));
    if (loginErrors[name as keyof ValidationErrors]) {
      setLoginErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleLogin = (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const formData = formRef.current ? new FormData(formRef.current) : null;
    const emailFromForm = String(formData?.get("email") ?? "").trim();
    const passwordFromForm = String(formData?.get("password") ?? "");
    const payload = {
      email: emailFromForm || loginInput.email.trim(),
      password: passwordFromForm || loginInput.password,
    };
    setLoginInput(payload);
    if (validateLoginForm(payload)) loginMutation.mutate(payload);
  };

  const toggleLanguage = () => void i18n.changeLanguage(language === "en" ? "ar" : "en");

  useEffect(() => {
    if (Object.keys(loginErrors).length === 0) return;
    const errors: ValidationErrors = {};
    const emailError = validateEmail(loginInput.email);
    const passwordError = validatePassword(loginInput.password);
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    setLoginErrors(errors);
  }, [language]);

  const dir = language === "ar" ? "rtl" : "ltr";
  const isArabic = language === "ar";

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[#0B1828]" dir={dir}>

      {/* ── LEFT PANEL — branding ── */}
      <div className="relative hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col items-center justify-center p-12 overflow-hidden">
        {/* Background layers */}
        <div className="absolute inset-0 bg-[#0B1828]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_50%,rgba(191,155,48,0.12),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#BF9B30]/40 to-transparent" />

        {/* Decorative circles */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-[#BF9B30]/8" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#BF9B30]/12" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full border border-[#BF9B30]/20" />

        {/* Glow blob */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-[#BF9B30]/10 blur-[80px]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center gap-8 text-center"
        >
          {/* Logo */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[#BF9B30]/20 blur-3xl scale-125" />
            <img
              src={siraLogo}
              alt="SIRA Logo"
              className="relative w-72 h-72 xl:w-80 xl:h-80 object-contain drop-shadow-[0_0_60px_rgba(191,155,48,0.5)]"
            />
          </div>

          {/* Brand text */}
          <div className="space-y-3">
            <h1 className="text-5xl xl:text-6xl font-black tracking-tight text-white">
              SIRA <span className="text-[#BF9B30]">CRM</span>
            </h1>
            <p className="text-[#BF9B30]/80 text-sm font-bold uppercase tracking-[0.4em]">
              Real Estate Management
            </p>
            <p className="text-white/40 text-xs font-bold max-w-xs leading-relaxed">
              {isArabic
                ? "منصة إدارة العقارات المتكاملة لفريق المبيعات"
                : "Integrated platform for real estate sales teams"}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── RIGHT PANEL — form ── */}
      <div className="relative flex w-full lg:w-1/2 xl:w-[45%] flex-col lg:items-center lg:justify-center">

        {/* Mobile top section — dark with logo */}
        <div className="relative flex flex-col items-center justify-center py-10 px-6 lg:hidden overflow-hidden">
          <div className="absolute inset-0 bg-[#0B1828]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_60%,rgba(191,155,48,0.18),transparent)]" />
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#BF9B30]/50 to-transparent" />
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex flex-col items-center gap-3"
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-[#BF9B30]/20 blur-2xl scale-125" />
              <img src={siraLogo} alt="SIRA" className="relative w-28 h-28 sm:w-36 sm:h-36 object-contain drop-shadow-[0_0_30px_rgba(191,155,48,0.5)]" />
            </div>
            <div className="text-center">
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                SIRA <span className="text-[#BF9B30]">CRM</span>
              </h1>
              <p className="text-[#BF9B30]/70 text-[10px] font-bold uppercase tracking-[0.35em] mt-1">Real Estate Management</p>
            </div>
          </motion.div>
        </div>

        {/* Form area */}
        <div className="relative flex flex-1 w-full items-center justify-center p-6 sm:p-10 lg:min-h-screen">
          <div className="absolute inset-0 bg-white" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_60%_at_50%_0%,rgba(191,155,48,0.05),transparent)]" />
          <div className="absolute top-0 left-0 right-0 h-0.5 lg:h-1 bg-gradient-to-r from-[#0B1828] via-[#BF9B30] to-[#0B1828]" />

          {/* Language toggle */}
          <button
            type="button"
            onClick={toggleLanguage}
            className={`absolute top-5 ${dir === "rtl" ? "left-5" : "right-5"} z-50 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black text-[#0B1828] shadow-sm hover:bg-slate-50 transition-colors`}
          >
            {language === "en" ? "ع" : "En"}
          </button>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          className="relative z-10 w-full max-w-[22rem] sm:max-w-[24rem] lg:max-w-[26rem]"
        >

          {/* Form header */}
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#BF9B30] mb-2">
              {isArabic ? "مرحباً بك" : "Welcome Back"}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black text-[#0B1828] leading-tight">
              {isArabic ? "تسجيل الدخول" : "Sign In"}
            </h2>
            <p className="mt-1.5 text-[12px] font-bold text-slate-400">
              {isArabic ? "أدخل بياناتك للوصول للنظام" : "Enter your credentials to access the platform"}
            </p>
          </div>

          <form ref={formRef} className="space-y-5" onSubmit={handleLogin}>
            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="login-email"
                className={`block text-[10px] font-black text-slate-500 ${isArabic ? "tracking-normal" : "uppercase tracking-wider"}`}
              >
                {t("auth.email")}
              </Label>
              <Input
                id="login-email"
                type="email"
                name="email"
                value={loginInput.email}
                placeholder={t("auth.enterEmail")}
                onChange={changeLoginInput}
                disabled={loginMutation.isPending}
                className={`h-auto rounded-2xl border bg-slate-50 px-4 py-3.5 text-[13px] font-bold text-[#0B1828] placeholder:text-slate-300 outline-none transition focus-visible:ring-2 focus-visible:bg-white ${
                  loginErrors.email
                    ? "border-rose-400 focus-visible:ring-rose-400/25"
                    : "border-slate-200 focus-visible:border-[#BF9B30] focus-visible:ring-[#BF9B30]/20"
                }`}
              />
              {loginErrors.email && (
                <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                  {loginErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label
                htmlFor="login-password"
                className={`block text-[10px] font-black text-slate-500 ${isArabic ? "tracking-normal" : "uppercase tracking-wider"}`}
              >
                {t("auth.password")}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  id="login-password"
                  name="password"
                  value={loginInput.password}
                  placeholder={t("auth.enterPassword")}
                  onChange={changeLoginInput}
                  disabled={loginMutation.isPending}
                  className={`h-auto rounded-2xl border bg-slate-50 px-4 py-3.5 pe-12 text-[13px] font-bold text-[#0B1828] placeholder:text-slate-300 outline-none transition focus-visible:ring-2 focus-visible:bg-white tracking-wide ${
                    loginErrors.password
                      ? "border-rose-400 focus-visible:ring-rose-400/25"
                      : "border-slate-200 focus-visible:border-[#BF9B30] focus-visible:ring-[#BF9B30]/20"
                  }`}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  className={`absolute top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-[#BF9B30] ${isArabic ? "left-3.5" : "right-3.5"}`}
                  onClick={() => setShowPassword((p) => !p)}
                >
                  {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              {loginErrors.password && (
                <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                  {loginErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className={`mt-2 h-auto w-full rounded-2xl bg-[#0B1828] py-4 font-black text-white shadow-lg shadow-[#0B1828]/25 transition-all hover:bg-[#16263a] hover:shadow-xl hover:shadow-[#0B1828]/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed ${
                isArabic ? "text-sm tracking-normal" : "text-xs tracking-[0.15em]"
              }`}
            >
              {loginMutation.isPending ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  {t("auth.pleaseWait")}
                </span>
              ) : (
                t("auth.login")
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-100" />
            <div className="flex items-center gap-2">
              <img src={siraLogo} alt="" className="w-4 h-4 object-contain opacity-40" />
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-300">
                SIRA Real Estate
              </span>
            </div>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
        </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Login;
