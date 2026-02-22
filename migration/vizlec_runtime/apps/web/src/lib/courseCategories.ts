export const COURSE_CATEGORY_LABELS: Record<string, string> = {
  HEALTH_SPORTS: 'Saúde e Esportes',
  FINANCE_INVESTMENTS: 'Finanças e Investimentos',
  RELATIONSHIPS: 'Relacionamentos',
  BUSINESS_CAREER: 'Negócios e Carreira',
  SPIRITUALITY: 'Espiritualidade',
  SEXUALITY: 'Sexualidade',
  ENTERTAINMENT: 'Entretenimento',
  COOKING_GASTRONOMY: 'Culinária e Gastronomia',
  LANGUAGES: 'Idiomas',
  LAW: 'Direito',
  APPS_SOFTWARE: 'Apps & Software',
  LITERATURE: 'Literatura',
  HOME_CONSTRUCTION: 'Casa e Construção',
  PERSONAL_DEVELOPMENT: 'Desenvolvimento Pessoal',
  FASHION_BEAUTY: 'Moda e Beleza',
  ANIMALS_PLANTS: 'Animais e Plantas',
  EDUCATIONAL: 'Educacional',
  HOBBIES: 'Hobbies',
  DESIGN: 'Design',
  INTERNET: 'Internet',
  ECOLOGY_ENVIRONMENT: 'Ecologia e Meio Ambiente',
  MUSIC_ARTS: 'Música e Artes',
  INFORMATION_TECHNOLOGY: 'Tecnologia da Informação',
  DIGITAL_ENTREPRENEURSHIP: 'Empreendedorismo Digital',
  OTHERS: 'Outros'
};

const HOTMART_NUMERIC_CATEGORY_LABELS: Record<string, string> = {
  '1': 'Outros',
  '2': 'Saúde e Esportes',
  '3': 'Finanças e Investimentos',
  '4': 'Relacionamentos',
  '5': 'Negócios e Carreira',
  '6': 'Espiritualidade',
  '7': 'Sexualidade',
  '8': 'Entretenimento',
  '9': 'Culinária e Gastronomia',
  '10': 'Idiomas',
  '11': 'Direito',
  '12': 'Apps & Software',
  '13': 'Literatura',
  '14': 'Casa e Construção',
  '15': 'Desenvolvimento Pessoal',
  '16': 'Moda e Beleza',
  '17': 'Animais e Plantas',
  '18': 'Educacional',
  '19': 'Hobbies',
  '20': 'Design',
  '21': 'Internet',
  '22': 'Ecologia e Meio Ambiente',
  '23': 'Música e Artes',
  '24': 'Tecnologia da Informação',
  '25': 'Empreendedorismo Digital'
};

const KIWIFY_NUMERIC_CATEGORY_LABELS: Record<string, string> = {
  '0': 'Saúde e Esportes',
  '1': 'Finanças e Investimentos',
  '2': 'Relacionamentos',
  '3': 'Negócios e Carreira',
  '4': 'Espiritualidade',
  '5': 'Sexualidade',
  '6': 'Entretenimento',
  '7': 'Culinária e Gastronomia',
  '8': 'Idiomas',
  '9': 'Direito',
  '10': 'Apps & Software',
  '11': 'Literatura',
  '12': 'Casa e Construção',
  '13': 'Desenvolvimento Pessoal',
  '14': 'Moda e Beleza',
  '15': 'Animais e Plantas',
  '16': 'Educacional',
  '17': 'Hobbies',
  '18': 'Internet',
  '19': 'Ecologia e Meio Ambiente',
  '20': 'Música e Artes',
  '21': 'Tecnologia da Informação',
  '22': 'Empreendedorismo Digital',
  '23': 'Outros'
};

export const resolveCourseCategoryLabel = (
  categoryId?: string | null,
  fallbackLabel?: string | null
): string => {
  const normalized = categoryId?.trim() ?? '';
  if (!normalized) return fallbackLabel?.trim() || 'General';
  return (
    COURSE_CATEGORY_LABELS[normalized] ||
    HOTMART_NUMERIC_CATEGORY_LABELS[normalized] ||
    KIWIFY_NUMERIC_CATEGORY_LABELS[normalized] ||
    fallbackLabel?.trim() ||
    'General'
  );
};
