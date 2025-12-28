declare module 'vosk' {
    export function setLogLevel(level: number): void;
    
    export class Model {
        constructor(modelPath: string);
        free(): void;
    }
    
    export class Recognizer {
        constructor(options: { model: Model; sampleRate: number });
        setWords(enable: boolean): void;
        setPartialWords(enable: boolean): void;
        acceptWaveform(data: Buffer): boolean;
        result(): RecognizerResult;
        finalResult(): RecognizerResult;
        partialResult(): { partial: string };
        free(): void;
    }
    
    export interface RecognizerResult {
        text?: string;
        result?: Array<{
            word: string;
            start: number;
            end: number;
            conf?: number;
        }>;
    }
}
