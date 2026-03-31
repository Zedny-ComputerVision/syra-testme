import en from './en.json';
import ar from './ar.json';
import ur from './ur.json';
import am from './am.json';
import id from './id.json';
import si from './si.json';
import ne from './ne.json';
import hi from './hi.json';
import fil from './fil.json';
import bn from './bn.json';

export const translations = { en, ar, ur, am, id, si, ne, hi, fil, bn };

export const languages = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', fontFamily: null },
  { code: 'ar', name: 'Arabic', nativeName: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', dir: 'rtl', fontFamily: "'Noto Sans Arabic'" },
  { code: 'ur', name: 'Urdu', nativeName: '\u0627\u0631\u062f\u0648', dir: 'rtl', fontFamily: "'Noto Nastaliq Urdu'" },
  { code: 'am', name: 'Amharic', nativeName: '\u12a0\u121b\u122d\u129b', dir: 'ltr', fontFamily: "'Noto Sans Ethiopic'" },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', dir: 'ltr', fontFamily: null },
  { code: 'si', name: 'Sinhala', nativeName: '\u0dc3\u0dd2\u0d82\u0dc4\u0dbd', dir: 'ltr', fontFamily: "'Noto Sans Sinhala'" },
  { code: 'ne', name: 'Nepali', nativeName: '\u0928\u0947\u092a\u093e\u0932\u0940', dir: 'ltr', fontFamily: "'Noto Sans Devanagari'" },
  { code: 'hi', name: 'Hindi', nativeName: '\u0939\u093f\u0928\u094d\u0926\u0940', dir: 'ltr', fontFamily: "'Noto Sans Devanagari'" },
  { code: 'fil', name: 'Filipino', nativeName: 'Filipino', dir: 'ltr', fontFamily: null },
  { code: 'bn', name: 'Bengali', nativeName: '\u09ac\u09be\u0982\u09b2\u09be', dir: 'ltr', fontFamily: "'Noto Sans Bengali'" },
];

export const rtlLanguages = ['ar', 'ur'];
