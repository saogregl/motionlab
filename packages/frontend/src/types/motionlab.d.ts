export interface MotionLabEndpoint {
  host: string;
  port: number;
  sessionToken?: string;
}

export interface MotionLabAPI {
  platform: string;
  getEngineEndpoint(): Promise<MotionLabEndpoint | null>;
}

declare global {
  interface Window {
    motionlab?: MotionLabAPI;
  }
}
