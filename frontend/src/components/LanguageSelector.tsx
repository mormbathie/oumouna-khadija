import { getLanguage, setLanguage, type Language } from '../i18n';

export function LanguageSelector() {
  return <select aria-label="Langue / Language / اللغة" value={getLanguage()}
    onChange={(event) => setLanguage(event.target.value as Language)}
    className="h-10 max-w-32 rounded-xl border border-stone-200 bg-white px-2 text-sm text-stone-700">
    <option value="fr">Français</option>
    <option value="en">English</option>
    <option value="ar">العربية</option>
  </select>;
}
