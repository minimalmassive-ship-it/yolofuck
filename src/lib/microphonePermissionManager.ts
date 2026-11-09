/**
 * Microphone Permission Manager & Diagnostics (Phase 5, Point 38)
 * 
 * Provides comprehensive error taxonomy, platform detection (Windows, Android, iOS, macOS, Linux),
 * and actionable, step-by-step resolution guides for all microphone acquisition failures.
 * 
 * Also includes hardware signal probing to detect physically muted microphones even when permissions are granted.
 */

export type DiagnosticPlatform = 'windows' | 'android' | 'ios' | 'macos' | 'linux' | 'generic_browser';

export type MicrophoneErrorType =
  | 'permission_denied'
  | 'system_privacy_blocked'
  | 'hardware_in_use'
  | 'no_device_found'
  | 'constraint_unsupported'
  | 'insecure_context'
  | 'aborted'
  | 'unknown';

export interface MicrophoneDiagnosticResult {
  success: boolean;
  errorName: string;
  errorType: MicrophoneErrorType;
  platform: DiagnosticPlatform;
  title: string;
  explanation: string;
  actionSteps: string[];
  canRetry: boolean;
  settingsDeepLink?: string;
}

export interface MicrophoneProbeResult {
  hasSignal: boolean;
  maxPeak: number;
  avgRms: number;
  isHardwareMuted: boolean;
}

export class MicrophonePermissionManager {
  /**
   * Accurately detects the active OS / client platform.
   */
  public static detectPlatform(): DiagnosticPlatform {
    if (typeof navigator === 'undefined') return 'generic_browser';

    const ua = navigator.userAgent || '';
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';

    // Android (Capacitor native APK or mobile browser)
    if (/Android/i.test(ua) || (typeof window !== 'undefined' && (window as any).Capacitor?.getPlatform() === 'android')) {
      return 'android';
    }

    // iOS (iPhone / iPad / iPod)
    if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      return 'ios';
    }

    // Windows (Desktop Electron or Windows browser)
    if (/Win/i.test(platform) || /Windows/i.test(ua)) {
      return 'windows';
    }

    // macOS
    if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
      return 'macos';
    }

    // Linux
    if (/Linux/i.test(platform) || /Linux/i.test(ua)) {
      return 'linux';
    }

    return 'generic_browser';
  }

  /**
   * Queries current microphone permission status via Permissions API if available.
   */
  public static async queryPermissionState(): Promise<PermissionState | 'unsupported'> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
      return 'unsupported';
    }

    try {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return status.state;
    } catch {
      return 'unsupported';
    }
  }

  /**
   * Diagnoses any microphone acquisition error and builds a tailored, actionable guide.
   */
  public static diagnose(err: any, platformOverride?: DiagnosticPlatform): MicrophoneDiagnosticResult {
    const platform = platformOverride || this.detectPlatform();
    const errorName = err?.name || 'UnknownError';
    const errorMessage = err?.message || String(err || '');

    let errorType: MicrophoneErrorType = 'unknown';

    // Check for insecure origin (HTTP vs HTTPS)
    if (typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      errorType = 'insecure_context';
    } else if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      errorType = 'permission_denied';
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      errorType = 'no_device_found';
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      errorType = 'hardware_in_use';
    } else if (errorName === 'OverconstrainedError' || errorName === 'ConstraintNotSatisfiedError') {
      errorType = 'constraint_unsupported';
    } else if (errorName === 'SecurityError') {
      errorType = 'insecure_context';
    } else if (errorName === 'AbortError') {
      errorType = 'aborted';
    }

    return this.buildDiagnosticReport(errorType, errorName, errorMessage, platform);
  }

  private static buildDiagnosticReport(
    errorType: MicrophoneErrorType,
    errorName: string,
    rawMessage: string,
    platform: DiagnosticPlatform
  ): MicrophoneDiagnosticResult {
    switch (errorType) {
      case 'permission_denied':
        return this.buildPermissionDeniedReport(errorName, platform);

      case 'hardware_in_use':
        return {
          success: false,
          errorName,
          errorType: 'hardware_in_use',
          platform,
          title: 'Microphone In Use by Another Application',
          explanation: 'Your audio input device could not be opened because another program has an exclusive lock or hardware session active.',
          actionSteps: [
            'Check for other open applications that use the microphone (Zoom, Microsoft Teams, Discord, OBS Studio, or a digital audio workstation / DAW).',
            'Mute or close the other program to release the hardware lock.',
            platform === 'windows'
              ? 'On Windows: Open Windows Sound Settings -> Additional device properties -> Advanced, and uncheck "Allow applications to take exclusive control of this device".'
              : 'Restart your browser or disconnect and reconnect your audio device.',
            'Click Retry to connect your microphone.'
          ],
          canRetry: true
        };

      case 'no_device_found':
        return {
          success: false,
          errorName,
          errorType: 'no_device_found',
          platform,
          title: 'No Microphone Detected',
          explanation: 'The system could not find any active audio input devices connected to your computer or phone.',
          actionSteps: [
            'Verify that your USB microphone, wired headset, or Bluetooth earbuds are securely connected.',
            platform === 'windows'
              ? 'On Windows: Open Windows Settings -> System -> Sound -> Input and confirm your microphone appears in the device list.'
              : platform === 'android'
              ? 'On Android: Reconnect your Bluetooth audio device or unplug and replug your headset.'
              : 'Check system sound settings to confirm your input device is recognized.',
            'Ensure the microphone driver is installed and not disabled in Device Manager.',
            'Click Retry once the device is connected.'
          ],
          canRetry: true,
          settingsDeepLink: platform === 'windows' ? 'ms-settings:sound' : undefined
        };

      case 'insecure_context':
        return {
          success: false,
          errorName,
          errorType: 'insecure_context',
          platform,
          title: 'Secure Context Required (HTTPS)',
          explanation: 'Modern browsers strictly prohibit microphone access over insecure HTTP connections to safeguard your privacy.',
          actionSteps: [
            'Ensure you are accessing Ideanite over a secure HTTPS URL (https://...).',
            'If developing locally, access the app via http://localhost or http://127.0.0.1.',
            'Verify that browser permissions policy is not blocking microphone delegation.'
          ],
          canRetry: false
        };

      case 'constraint_unsupported':
        return {
          success: false,
          errorName,
          errorType: 'constraint_unsupported',
          platform,
          title: 'Audio Constraints Not Supported',
          explanation: 'The requested audio settings (such as sample rate, channel count, or device ID) are not supported by the selected microphone.',
          actionSteps: [
            'Ideanite will automatically fall back to standard 16kHz mono constraints.',
            'Unplug external audio interfaces with non-standard sample rates (e.g. 192kHz) or set default format to 16-bit 44.1/48kHz in OS settings.',
            'Click Retry to connect with default audio parameters.'
          ],
          canRetry: true
        };

      case 'aborted':
        return {
          success: false,
          errorName,
          errorType: 'aborted',
          platform,
          title: 'Microphone Request Aborted',
          explanation: 'The microphone prompt was cancelled or a hardware error interrupted the connection.',
          actionSteps: [
            'Ensure you do not dismiss the browser permission prompt.',
            'Click Retry to request microphone access again.'
          ],
          canRetry: true
        };

      default:
        return {
          success: false,
          errorName,
          errorType: 'unknown',
          platform,
          title: 'Microphone Initialization Failed',
          explanation: rawMessage || 'An unexpected audio hardware or system error occurred.',
          actionSteps: [
            'Verify your microphone is plugged in and working in other applications.',
            'Refresh the page or restart the Ideanite application.',
            'Check OS privacy permissions and browser site settings.'
          ],
          canRetry: true
        };
    }
  }

  private static buildPermissionDeniedReport(
    errorName: string,
    platform: DiagnosticPlatform
  ): MicrophoneDiagnosticResult {
    if (platform === 'windows') {
      return {
        success: false,
        errorName,
        errorType: 'permission_denied',
        platform,
        title: 'Microphone Permission Blocked (Windows)',
        explanation: 'Microphone access was denied. This is usually caused by either the browser site permission being set to Block or Windows privacy switches being turned off.',
        actionSteps: [
          '1. In your browser address bar, click the lock icon (or tune icon) immediately to the left of the URL.',
          '2. Set "Microphone" from Block to "Allow".',
          '3. Open Windows Settings -> Privacy & Security -> Microphone.',
          '4. Ensure "Microphone access" is toggled ON.',
          '5. Ensure "Let desktop apps access your microphone" (or your browser name) is toggled ON.',
          '6. Click Retry below or reload the page.'
        ],
        canRetry: true,
        settingsDeepLink: 'ms-settings:privacy-microphone'
      };
    }

    if (platform === 'android') {
      return {
        success: false,
        errorName,
        errorType: 'permission_denied',
        platform,
        title: 'Microphone Permission Blocked (Android)',
        explanation: 'Android system settings or the browser blocked microphone access.',
        actionSteps: [
          '1. Open Android Settings -> Apps -> Ideanite (or Chrome).',
          '2. Tap "Permissions" -> "Microphone".',
          '3. Select "Allow only while using the app".',
          '4. Swipe down Android Quick Settings and ensure the master "Mic access" privacy tile is active.',
          '5. Return to Ideanite and tap Retry.'
        ],
        canRetry: true
      };
    }

    if (platform === 'ios') {
      return {
        success: false,
        errorName,
        errorType: 'permission_denied',
        platform,
        title: 'Microphone Permission Blocked (iOS)',
        explanation: 'Safari or iOS system privacy settings prevented microphone capture.',
        actionSteps: [
          '1. Open iOS Settings -> Safari (or Ideanite).',
          '2. Scroll down to "Microphone" and change to "Allow" or "Ask".',
          '3. Open iOS Settings -> Privacy & Security -> Microphone and ensure Safari/Ideanite is enabled.',
          '4. Return to the app and tap Retry.'
        ],
        canRetry: true
      };
    }

    if (platform === 'macos') {
      return {
        success: false,
        errorName,
        errorType: 'permission_denied',
        platform,
        title: 'Microphone Permission Blocked (macOS)',
        explanation: 'macOS system security settings prevented access to the microphone.',
        actionSteps: [
          '1. Click the lock/site settings icon in your browser address bar and set Microphone to "Allow".',
          '2. Open macOS System Settings -> Privacy & Security -> Microphone.',
          '3. Toggle ON the switch next to your browser or the Ideanite app.',
          '4. Restart the browser if requested, then click Retry.'
        ],
        canRetry: true
      };
    }

    return {
      success: false,
      errorName,
      errorType: 'permission_denied',
      platform,
      title: 'Microphone Permission Denied',
      explanation: 'Microphone access was denied by your browser permissions or privacy settings.',
      actionSteps: [
        '1. Click the lock icon or site settings button in your browser URL address bar.',
        '2. Change Microphone permission to "Allow".',
        '3. Check operating system privacy settings to ensure microphone access is permitted.',
        '4. Reload the page and click Retry.'
      ],
      canRetry: true
    };
  }

  /**
   * Attempts to acquire microphone stream, returning diagnostic report if it fails.
   */
  public static async requestMicrophoneWithDiagnostics(
    constraints?: MediaStreamConstraints
  ): Promise<{
    stream: MediaStream | null;
    diagnostic: MicrophoneDiagnosticResult | null;
  }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error('navigator.mediaDevices.getUserMedia is unavailable in this environment');
      return {
        stream: null,
        diagnostic: this.diagnose(err)
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints || { audio: true });
      return { stream, diagnostic: null };
    } catch (err: any) {
      const diagnostic = this.diagnose(err);
      return { stream: null, diagnostic };
    }
  }

  /**
   * Probes an active MediaStream for actual audio energy.
   * Detects hardware mute switches (e.g. headset button set to mute, zero dB input).
   */
  public static async testMicrophoneInput(
    stream: MediaStream,
    durationMs: number = 400
  ): Promise<MicrophoneProbeResult> {
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0 || audioTracks[0].readyState !== 'live') {
      return { hasSignal: false, maxPeak: 0, avgRms: 0, isHardwareMuted: true };
    }

    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      return { hasSignal: true, maxPeak: 0.1, avgRms: 0.05, isHardwareMuted: false };
    }

    const ctx = new AudioCtx({ sampleRate: 16000 });
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buffer = new Float32Array(analyser.fftSize);
      let maxPeak = 0;
      let totalRms = 0;
      let samplesCount = 0;

      const startTime = Date.now();
      while (Date.now() - startTime < durationMs) {
        analyser.getFloatTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          const val = Math.abs(buffer[i]);
          if (val > maxPeak) maxPeak = val;
          sumSquares += buffer[i] * buffer[i];
        }
        totalRms += Math.sqrt(sumSquares / buffer.length);
        samplesCount++;

        // Brief delay between probes
        await new Promise(r => setTimeout(r, 40));
      }

      const avgRms = samplesCount > 0 ? totalRms / samplesCount : 0;
      // If peak is virtually 0 (below -60 dBFS ~ 0.001 linear), hardware is muted
      const isHardwareMuted = maxPeak < 0.001;

      return {
        hasSignal: !isHardwareMuted,
        maxPeak: Math.round(maxPeak * 1000) / 1000,
        avgRms: Math.round(avgRms * 1000) / 1000,
        isHardwareMuted
      };
    } finally {
      if (ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    }
  }
}
