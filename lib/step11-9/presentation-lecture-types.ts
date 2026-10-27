export type PresentationLectureRequest = {
  requestId: string;
  version: string;
  presentationName: string;
  slideNumber: number;
  slideCount: number;
};

export type PresentationLectureStreamMeta = {
  presentationName: string;
  version: string;
  slideNumber: number;
  slideCount: number;
  slideTitle: string;
  slideText: string;
  extractedCharacters: number;
  visualDescriptions: string[];
  citations: string[];
  textbookGlossaryMatches: number;
};
