/** Bilingual labels for SIH26190 investigator UI (MHA). */
export type LegalUiLang = "en" | "hi";

export const LEGAL_UI: Record<
  LegalUiLang,
  {
    title: string;
    upload: string;
    verify: string;
    readiness: string;
    courtPrep: string;
    register: string;
  }
> = {
  en: {
    title: "Legal Document Management",
    upload: "Upload & register",
    verify: "Verify bundle",
    readiness: "Court readiness",
    courtPrep: "Run court prep",
    register: "Document register",
  },
  hi: {
    title: "कानूनी दस्तावेज़ प्रबंधन",
    upload: "अपलोड व पंजीकरण",
    verify: "बंडल सत्यापन",
    readiness: "न्यायालय तैयारी",
    courtPrep: "कोर्ट प्रेप चलाएँ",
    register: "दस्तावेज़ रजिस्टर",
  },
};
