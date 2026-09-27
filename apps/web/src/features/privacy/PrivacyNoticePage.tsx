import { DELETION_GRACE_DAYS, type Language, PRIVACY_NOTICE_VERSION } from '@samaj/shared';
import { Link } from 'react-router';
import { BrandMark } from '@/components/layout/BrandMark';
import { LanguageSwitch } from '@/components/layout/LanguageSwitch';
import { Card, Icon, Skeleton, buttonVariants } from '@/components/ui';
import { ArrowLeft, Mail, Phone, ShieldCheck } from '@/components/ui/icons';
import { formatDate, useLanguageStore, useT } from '@/i18n';
import { usePrivacyInfo } from './api';

/*
 * The privacy notice. Plain words, in both languages, kept in this file (not
 * the shared dictionary) so the long text only downloads when someone opens
 * it. Change PRIVACY_NOTICE_VERSION when the substance changes: everyone is
 * then asked to agree again. Have a lawyer review this text before launch.
 */

interface Section {
  title: string;
  body?: string[];
  list?: string[];
}

const NOTICE: Record<Language, Section[]> = {
  en: [
    {
      title: 'Who we are',
      body: [
        'Samaj is run by the Teli Samaj organisation for its member families. Under India’s Digital Personal Data Protection Act, 2023, we are the “data fiduciary”: we decide why and how your personal data is used, and we are responsible for it.',
        'This notice says what we collect, why, who sees it, how long we keep it, and what you can do about it.',
      ],
    },
    {
      title: 'What we collect',
      list: [
        'Your account: name, mobile number, a password (stored only in scrambled form, never readable), and your language.',
        'Your family: village or town, branch, gotra and address.',
        'People in your family: name, relation, gender, birth year, occupation, education, mobile number and photo, as your family enters them.',
        'Matrimony profiles, only if your family creates one: height, education, work, income range and the other details on the profile.',
        'What you do in the app: notices and events you post, replies to events, requests between families, and a history of changes to your family.',
        'Sign-ins: when you signed in and the kind of device, to keep your account safe.',
      ],
    },
    {
      title: 'Why we use it',
      list: [
        'To keep a directory of member families, so the samaj can stay in touch.',
        'So your branch committee can verify families, and help with sign-in problems.',
        'To share notices and events from your branch and district.',
        'For matrimony, only for profiles your family creates, with the person’s agreement.',
        'To keep the app and your account secure.',
      ],
      body: ['We don’t sell your data, show advertising, or share it with anyone outside the samaj, except where the law requires it.'],
    },
    {
      title: 'Who sees what',
      list: [
        'Mobile numbers: your own family and your branch committee. Each person can choose to show theirs to members of their branch, or to all verified members.',
        'Address: your own family and your branch committee.',
        'Names, place, relation, gotra and occupation: verified member families, in the directory. Anyone can choose not to be listed; the family and committee still see them.',
        'Matrimony profiles: verified families looking for a match, under the matrimony rules shown in the app.',
        'Branch committees and admins see what they need to verify families and run the samaj, within their branch.',
      ],
    },
    {
      title: 'Children',
      body: [
        'A person under 18 is listed only by their parent or guardian, who confirms this when adding them. There are no matrimony profiles for anyone under the legal age of marriage, and we don’t track children or show them anything targeted.',
      ],
    },
    {
      title: 'How long we keep it',
      body: [
        'For as long as your account or family is in Samaj. When you delete your data, it is erased ' +
          `${DELETION_GRACE_DAYS} days later (you can cancel until then). Copies in backups are removed as backups roll over, within 30 days. Where your name appears in another family’s records, such as their change history, it is replaced with “Former member”.`,
      ],
    },
    {
      title: 'Your rights',
      list: [
        'See your data: download everything we hold about you and your family from Profile → Privacy and your data.',
        'Correct it: edit your details on your family page, or ask your branch committee.',
        'Delete it, or withdraw your consent: from Profile → Privacy and your data. You can also stop being listed in the directory without deleting anything.',
        'Nominate someone to act for you if you die or can’t act yourself: write to the contact below.',
        'Complain: write to the contact below. If you’re not satisfied with the answer, you can complain to the Data Protection Board of India.',
      ],
    },
    {
      title: 'Keeping it safe',
      body: [
        'Passwords are stored scrambled. The app is served over an encrypted connection. Each person sees only what their role allows, and committee members only within their branch.',
      ],
    },
    {
      title: 'Changes to this notice',
      body: ['When this notice changes in substance, we’ll show it to you again and ask you to agree before you continue.'],
    },
  ],
  mr: [
    {
      title: 'आम्ही कोण',
      body: [
        'समाज हे ॲप तेली समाज संस्था आपल्या सदस्य कुटुंबांसाठी चालवते. भारताच्या डिजिटल वैयक्तिक डेटा संरक्षण कायदा, २०२३ नुसार आम्ही “डेटा फिड्युशियरी” आहोत: तुमचा वैयक्तिक डेटा का व कसा वापरला जातो हे आम्ही ठरवतो, व त्याची जबाबदारी आमची आहे.',
        'ही सूचना सांगते की आम्ही काय गोळा करतो, का, तो कोणाला दिसतो, किती काळ ठेवतो, व तुम्ही त्याबाबत काय करू शकता.',
      ],
    },
    {
      title: 'आम्ही काय गोळा करतो',
      list: [
        'तुमचे खाते: नाव, मोबाईल क्रमांक, पासवर्ड (फक्त गुप्त स्वरूपात साठवलेला, कधीही वाचता येत नाही), व तुमची भाषा.',
        'तुमचे कुटुंब: गाव किंवा शहर, शाखा, गोत्र व पत्ता.',
        'कुटुंबातील व्यक्ती: नाव, नाते, लिंग, जन्मवर्ष, व्यवसाय, शिक्षण, मोबाईल क्रमांक व फोटो, जसे तुमचे कुटुंब भरते.',
        'विवाह प्रोफाइल, फक्त तुमच्या कुटुंबाने तयार केल्यास: उंची, शिक्षण, काम, उत्पन्न गट व प्रोफाइलवरील इतर माहिती.',
        'ॲपमधील तुमची कृती: तुम्ही टाकलेल्या सूचना व कार्यक्रम, कार्यक्रमांना दिलेली उत्तरे, कुटुंबांमधील विनंत्या, व तुमच्या कुटुंबातील बदलांचा इतिहास.',
        'लॉग इन: तुमचे खाते सुरक्षित ठेवण्यासाठी, तुम्ही कधी लॉग इन केले व कोणते उपकरण वापरले.',
      ],
    },
    {
      title: 'आम्ही ते का वापरतो',
      list: [
        'सदस्य कुटुंबांची सूची ठेवण्यासाठी, म्हणजे समाज एकमेकांच्या संपर्कात राहील.',
        'तुमच्या शाखा समितीला कुटुंबांची पडताळणी करता यावी व लॉग इनच्या अडचणीत मदत करता यावी म्हणून.',
        'तुमच्या शाखा व जिल्ह्याकडून सूचना व कार्यक्रम कळवण्यासाठी.',
        'विवाहासाठी, फक्त तुमच्या कुटुंबाने त्या व्यक्तीच्या संमतीने तयार केलेल्या प्रोफाइलसाठी.',
        'ॲप व तुमचे खाते सुरक्षित ठेवण्यासाठी.',
      ],
      body: ['आम्ही तुमचा डेटा विकत नाही, जाहिराती दाखवत नाही, व कायद्याने आवश्यक असेल त्याशिवाय समाजाबाहेर कोणाला देत नाही.'],
    },
    {
      title: 'कोणाला काय दिसते',
      list: [
        'मोबाईल क्रमांक: तुमचे स्वतःचे कुटुंब व तुमची शाखा समिती. प्रत्येक व्यक्ती आपला क्रमांक आपल्या शाखेतील सदस्यांना, किंवा सर्व पडताळलेल्या सदस्यांना दाखवणे निवडू शकते.',
        'पत्ता: तुमचे स्वतःचे कुटुंब व तुमची शाखा समिती.',
        'नाव, गाव, नाते, गोत्र व व्यवसाय: सदस्य सूचीत पडताळलेल्या सदस्य कुटुंबांना. कोणीही सूचीत न दिसणे निवडू शकते; कुटुंब व समितीला ते दिसत राहतात.',
        'विवाह प्रोफाइल: ॲपमध्ये दाखवलेल्या विवाह नियमांनुसार, जोडीदार शोधणाऱ्या पडताळलेल्या कुटुंबांना.',
        'शाखा समिती व प्रशासकांना कुटुंबांची पडताळणी व समाजाचे काम करण्यासाठी आवश्यक तेवढेच, त्यांच्या शाखेपुरते दिसते.',
      ],
    },
    {
      title: 'मुले',
      body: [
        '१८ वर्षांखालील व्यक्तीची नोंद फक्त तिचे आई-वडील किंवा पालक करू शकतात, व नोंद करताना ते याची खात्री देतात. विवाहाच्या कायदेशीर वयाखालील कोणाचेही विवाह प्रोफाइल नसते, व आम्ही मुलांचा मागोवा घेत नाही किंवा त्यांना लक्ष्य करून काही दाखवत नाही.',
      ],
    },
    {
      title: 'आम्ही किती काळ ठेवतो',
      body: [
        `तुमचे खाते किंवा कुटुंब समाजमध्ये असेपर्यंत. तुम्ही तुमचा डेटा हटवल्यावर तो ${DELETION_GRACE_DAYS} दिवसांनी पुसला जातो (तोपर्यंत तुम्ही रद्द करू शकता). बॅकअपमधील प्रती बॅकअप बदलत जातात तशा ३० दिवसांत काढल्या जातात. दुसऱ्या कुटुंबाच्या नोंदींमध्ये, जसे त्यांच्या बदलांचा इतिहास, तुमचे नाव असेल तर त्याऐवजी “माजी सदस्य” लिहिले जाते.`,
      ],
    },
    {
      title: 'तुमचे अधिकार',
      list: [
        'तुमचा डेटा पहा: प्रोफाइल → गोपनीयता व तुमचा डेटा येथून तुमच्याबद्दल व तुमच्या कुटुंबाबद्दल आमच्याकडे असलेले सर्व डाउनलोड करा.',
        'दुरुस्त करा: तुमच्या कुटुंबाच्या पानावर माहिती बदला, किंवा शाखा समितीला सांगा.',
        'हटवा, किंवा संमती मागे घ्या: प्रोफाइल → गोपनीयता व तुमचा डेटा येथून. काहीही न हटवता तुम्ही सदस्य सूचीत दिसणे थांबवू शकता.',
        'तुमचा मृत्यू झाल्यास किंवा तुम्ही स्वतः कृती करू शकत नसल्यास तुमच्या वतीने काम करण्यासाठी कोणाला नामनिर्देशित करा: खालील संपर्कावर लिहा.',
        'तक्रार करा: खालील संपर्कावर लिहा. उत्तराने समाधान न झाल्यास तुम्ही भारताच्या डेटा संरक्षण मंडळाकडे तक्रार करू शकता.',
      ],
    },
    {
      title: 'सुरक्षितता',
      body: [
        'पासवर्ड गुप्त स्वरूपात साठवले जातात. ॲप एन्क्रिप्ट केलेल्या जोडणीवरून चालते. प्रत्येकाला फक्त त्याच्या भूमिकेनुसार दिसते, व समिती सदस्यांना फक्त त्यांच्या शाखेपुरते.',
      ],
    },
    {
      title: 'या सूचनेतील बदल',
      body: ['या सूचनेत महत्त्वाचा बदल झाल्यास आम्ही ती तुम्हाला पुन्हा दाखवू व पुढे जाण्यापूर्वी तुमची संमती घेऊ.'],
    },
  ],
};

function Contact() {
  const t = useT();
  const info = usePrivacyInfo();
  if (info.isPending) return <Skeleton className="h-16 w-full rounded-md" />;
  const contact = info.data?.contact;
  const any = contact && (contact.name || contact.email || contact.phone);
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold text-fg">{t('privacy.contactTitle')}</h2>
      {any ? (
        <div className="flex flex-col gap-1 text-fg">
          {contact.name && <p className="font-semibold">{contact.name}</p>}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-primary hover:underline">
              <Icon icon={Mail} size="sm" />
              {contact.email}
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-primary tabular-nums hover:underline">
              <Icon icon={Phone} size="sm" />
              {contact.phone}
            </a>
          )}
        </div>
      ) : (
        <p className="text-sm text-fg">{t('privacy.contactFallback')}</p>
      )}
    </Card>
  );
}

/** /privacy: public, so it can be read before signing up. */
export function PrivacyNoticePage() {
  const t = useT();
  const language = useLanguageStore((s) => s.language);
  const sections = NOTICE[language];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface px-4 py-3 sm:px-6">
        <Link to="/" aria-label={t('app.name')}>
          <BrandMark />
        </Link>
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
        <button type="button" onClick={() => history.back()} className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} self-start`}>
          <Icon icon={ArrowLeft} />
          {t('privacy.back')}
        </button>
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Icon icon={ShieldCheck} weight="duotone" />
            {t('privacy.noticeKicker')}
          </p>
          <h1 className="font-display text-3xl font-semibold text-fg">{t('privacy.noticeTitle')}</h1>
          <p className="text-sm text-fg-muted">{t('privacy.version', { date: formatDate(`${PRIVACY_NOTICE_VERSION}T00:00:00`, language) })}</p>
        </div>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="font-display text-xl font-semibold text-fg">{s.title}</h2>
            {s.list && (
              <ul className="flex list-disc flex-col gap-1.5 pl-5 text-fg marker:text-primary">
                {s.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {s.body?.map((p) => (
              <p key={p} className="max-w-prose text-fg">
                {p}
              </p>
            ))}
          </section>
        ))}
        <Contact />
      </main>
    </div>
  );
}
