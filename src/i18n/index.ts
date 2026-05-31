import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import enTranslation from "./translate/en.json";
import arTranslation from "./translate/ar.json";

const resources = {
  en: {
    translation: enTranslation,
  },
  ar: {
    translation: arTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
    supportedLngs: ["en", "ar"],
  });

const applyDocumentLanguage = (lng: string) => {
  const normalized = String(lng || "en").toLowerCase().startsWith("ar") ? "ar" : "en";
  document.documentElement.lang = normalized;
  document.documentElement.dir = normalized === "ar" ? "rtl" : "ltr";
};

if (typeof document !== "undefined") {
  applyDocumentLanguage(i18n.language);
  i18n.on("languageChanged", applyDocumentLanguage);
}

export default i18n;
