export const sizes = {
  portrait: { name: 'Publicación vertical', width: 1080, height: 1350, ratio: '4:5', note: 'Publicaciones y carruseles verticales', safeTop: 0, safeBottom: 0 },
  tall: { name: 'Publicación 3:4', width: 1080, height: 1440, ratio: '3:4', note: 'Más espacio vertical para tus fotografías', safeTop: 0, safeBottom: 0 },
  square: { name: 'Publicación cuadrada', width: 1080, height: 1080, ratio: '1:1', note: 'Formato clásico para el feed', safeTop: 0, safeBottom: 0 },
  landscape: { name: 'Publicación horizontal', width: 1080, height: 566, ratio: '1,91:1', note: 'Composiciones panorámicas con ficha debajo', safeTop: 0, safeBottom: 0 },
  story: { name: 'Historia', width: 1080, height: 1920, ratio: '9:16', note: 'Reserva superior de 180 px e inferior de 250 px para la interfaz de Instagram', safeTop: 180, safeBottom: 250 },
} as const;
export type OutputSize = keyof typeof sizes;

export const fonts = {
  original: { name: 'Fuente del marco', family: '', description: 'Identidad original' },
  sans: { name: 'DM Sans', family: '"DM Sans", sans-serif', description: 'Moderna y limpia' },
  editorial: { name: 'Playfair Display', family: '"Playfair Display", Georgia, serif', description: 'Editorial elegante' },
  classic: { name: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif', description: 'Clásica y refinada' },
  modern: { name: 'Montserrat', family: '"Montserrat", sans-serif', description: 'Geométrica y contemporánea' },
  technical: { name: 'DM Mono', family: '"DM Mono", monospace', description: 'Precisión técnica' },
} as const;
export type FontStyle = keyof typeof fonts;
export const palettes = {
  original: { name: 'Colores del marco', description: 'La combinación original de cada diseño' },
  auto: { name: 'Automático · según la foto', description: 'Tonos de tu imagen, con texto de alto contraste' },
  ink: { name: 'Tinta y papel', description: 'Blanco cálido y negro profundo' },
  ocean: { name: 'Azul mineral', description: 'Azul profundo sobre gris frío' },
  wine: { name: 'Burdeos editorial', description: 'Vino oscuro sobre marfil' },
} as const;
export type ColorPalette = keyof typeof palettes;
export const storyTemplates = {
  editorial: { name: 'Editorial', description: 'Título superior · fotografía enmarcada' },
  exhibition: { name: 'Exposición', description: 'Fotografía protagonista · título al pie' },
  cover: { name: 'Portada', description: 'Imagen completa · texto sobre degradado' },
} as const;
export type StoryTemplate = keyof typeof storyTemplates;
export type StoryPresentation = { template: StoryTemplate; showMetadata: boolean };
export const defaultStoryPresentation: StoryPresentation = { template: 'editorial', showMetadata: true };
export type Presentation = { size: OutputSize; font: FontStyle; palette: ColorPalette; story: StoryPresentation };
export const defaultPresentation: Presentation = { size: 'portrait', font: 'original', palette: 'original', story: defaultStoryPresentation };
