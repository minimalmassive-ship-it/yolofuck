/**
 * Audio Device Manager & Disconnect / Hot-Plug Protection
 * Phase 5, Point 34: Obsluga odpiecia urzadzenia w locie (Audio Device Drop)
 * 
 * Protects active recording and voice recognition sessions against sudden
 * hardware disconnects (unplugged USB headsets, Bluetooth earbud disconnects / battery exhaustion).
 * Captures track 'ended' / 'mute' and 'devicechange' events, preserves in-flight audio buffers,
 * and automatically fails over to the default system microphone without crashing the recording pipeline.
 */

import { MicrophonePermissionManager, type MicrophoneDiagnosticResult } from './microphonePermissionManager';

export interface AudioDeviceDropEvent {
  type: 'device_drop' | 'device_reconnected' | 'no_fallback_device' | 'track_ended' | 'track_muted';
  deviceId?: string;
  deviceLabel?: string;
  timestamp: number;
  recovered: boolean;
  fallbackDevice?: MediaDeviceInfo;
  newStream?: MediaStream;
  error?: Error;
}

export type AudioDeviceDropListener = (event: AudioDeviceDropEvent) => void;

export interface ResilientStreamHandle {
  stream: MediaStream;
  activeDevice: MediaDeviceInfo | null;
  disconnect: () => void;
  onDeviceDrop: (listener: AudioDeviceDropListener) => () => void;
}

export class AudioDeviceManager {
  private deviceChangeListeners: Set<(devices: MediaDeviceInfo[]) => void> = new Set();
  private isDeviceChangeSubscribed: boolean = false;
  private cachedDevices: MediaDeviceInfo[] = [];

  constructor() {
    this.initDeviceChangeListener();
  }

  /**
   * Initializes global devicechange listener on navigator.mediaDevices if available.
   */
  private initDeviceChangeListener(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) {
      return;
    }

    if (!this.isDeviceChangeSubscribed) {
      this.isDeviceChangeSubscribed = true;
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        try {
          const devices = await this.getAudioInputDevices();
          this.cachedDevices = devices;
          for (const listener of this.deviceChangeListeners) {
            try {
              listener(devices);
            } catch (err) {
              console.warn('[AudioDeviceManager] Error in device change listener:', err);
            }
          }
        } catch (e) {
          console.warn('[AudioDeviceManager] Failed updating devices after devicechange event:', e);
        }
      });
    }
  }

  /**
   * Lists all available physical and virtual audio input devices.
   */
  public async getAudioInputDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = allDevices.filter(d => d.kind === 'audioinput');
      this.cachedDevices = inputs;
      return inputs;
    } catch (err) {
      console.warn('[AudioDeviceManager] Could not enumerate audio input devices:', err);
      return [];
    }
  }

  /**
   * Intelligently selects the best physical or preferred audio input device,
   * explicitly avoiding silent virtual loopback devices (e.g. VB-Audio Virtual Cable, Stereo Mix).
   */
  public resolvePreferredAudioDevice(devices: MediaDeviceInfo[]): MediaDeviceInfo | null {
    if (!devices || devices.length === 0) return null;

    const isVirtualSilence = (label: string = '') => {
      const l = label.toLowerCase();
      return l.includes('cable output') ||
             l.includes('vb-audio') ||
             l.includes('virtual cable') ||
             l.includes('stereo mix') ||
             l.includes('miks stereo') ||
             l.includes('line in') ||
             l.includes('wejście liniowe');
    };

    // 1. If system default is not virtual silence, prefer default
    const defaultDev = devices.find(d => d.deviceId === 'default' && !isVirtualSilence(d.label));
    if (defaultDev) return defaultDev;

    // 2. Look for real physical USB / microphone hardware
    const physicalMic = devices.find(d => !isVirtualSilence(d.label) && (
      d.label.toLowerCase().includes('usb') ||
      d.label.toLowerCase().includes('microphone') ||
      d.label.toLowerCase().includes('mikrofon') ||
      d.label.toLowerCase().includes('mic') ||
      d.label.toLowerCase().includes('headset')
    ) && d.deviceId !== 'communications');
    if (physicalMic) return physicalMic;

    // 3. Any non-virtual device
    const nonVirtual = devices.find(d => !isVirtualSilence(d.label) && d.deviceId !== 'communications');
    if (nonVirtual) return nonVirtual;

    // 4. Default or first device fallback
    return devices.find(d => d.deviceId === 'default') || devices[0];
  }

  /**
   * Returns the system default or first available microphone.
   */
  public async getDefaultAudioInput(): Promise<MediaDeviceInfo | null> {
    const devices = await this.getAudioInputDevices();
    if (devices.length === 0) return null;
    return this.resolvePreferredAudioDevice(devices);
  }

  /**
   * Subscribes to hardware plug/unplug events.
   */
  public subscribeToDeviceChanges(listener: (devices: MediaDeviceInfo[]) => void): () => void {
    this.deviceChangeListeners.add(listener);
    return () => {
      this.deviceChangeListeners.delete(listener);
    };
  }

  /**
   * Attaches an active disconnection guard to an existing MediaStream.
   * If a track ends unexpectedly or is muted due to hardware drop, executes the callback
   * and optionally attempts automatic fallback to an alternative active microphone.
   */
  public attachTrackDisconnectGuard(
    stream: MediaStream,
    onDrop: AudioDeviceDropListener,
    options: { autoRecover?: boolean; preferredDeviceId?: string } = { autoRecover: true }
  ): () => void {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      return () => {};
    }

    let isDisposed = false;
    const trackListeners: Array<{ track: MediaStreamTrack; ended: () => void; mute: () => void }> = [];

    const handleTrackDisconnection = async (track: MediaStreamTrack, reason: 'ended' | 'muted') => {
      if (isDisposed) return;
      console.warn(`[AudioDeviceManager] Active audio track ${track.label || track.id} was ${reason}!`);

      const initialEvent: AudioDeviceDropEvent = {
        type: reason === 'ended' ? 'track_ended' : 'track_muted',
        deviceId: track.getSettings?.().deviceId,
        deviceLabel: track.label,
        timestamp: Date.now(),
        recovered: false
      };

      if (!options.autoRecover) {
        onDrop(initialEvent);
        return;
      }

      // Attempt hot-swap recovery to default or another available mic
      try {
        const availableInputs = await this.getAudioInputDevices();
        // Exclude the dropped device if we know its ID
        const droppedId = track.getSettings?.().deviceId;
        const candidateDevice = availableInputs.find(d => d.deviceId && d.deviceId !== droppedId) || availableInputs[0];

        if (!candidateDevice) {
          console.error('[AudioDeviceManager] No fallback audio input device available after disconnect.');
          onDrop({
            ...initialEvent,
            type: 'no_fallback_device',
            recovered: false,
            error: new Error('All audio input devices disconnected')
          });
          return;
        }

        console.log(`[AudioDeviceManager] Attempting hot-swap recovery to fallback microphone: ${candidateDevice.label || candidateDevice.deviceId}...`);
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: candidateDevice.deviceId ? { deviceId: { exact: candidateDevice.deviceId } } : true
        });

        const newAudioTrack = fallbackStream.getAudioTracks()[0];
        if (!newAudioTrack) {
          throw new Error('Fallback stream provided no active audio track');
        }

        // Hot-swap track into existing stream
        stream.removeTrack(track);
        stream.addTrack(newAudioTrack);

        // Re-attach guard to the new track
        if (!isDisposed) {
          const newEnded = () => handleTrackDisconnection(newAudioTrack, 'ended');
          const newMute = () => handleTrackDisconnection(newAudioTrack, 'muted');
          newAudioTrack.addEventListener('ended', newEnded);
          newAudioTrack.addEventListener('mute', newMute);
          trackListeners.push({ track: newAudioTrack, ended: newEnded, mute: newMute });
        }

        console.log(`[AudioDeviceManager] Audio pipeline recovered successfully on: ${newAudioTrack.label}`);
        onDrop({
          type: 'device_reconnected',
          deviceId: candidateDevice.deviceId,
          deviceLabel: candidateDevice.label,
          timestamp: Date.now(),
          recovered: true,
          fallbackDevice: candidateDevice,
          newStream: fallbackStream
        });
      } catch (recoveryErr: any) {
        console.error('[AudioDeviceManager] Hot-swap recovery failed:', recoveryErr);
        onDrop({
          ...initialEvent,
          recovered: false,
          error: recoveryErr
        });
      }
    };

    for (const track of audioTracks) {
      const ended = () => handleTrackDisconnection(track, 'ended');
      const mute = () => handleTrackDisconnection(track, 'muted');
      track.addEventListener('ended', ended);
      track.addEventListener('mute', mute);
      trackListeners.push({ track, ended, mute });
    }

    return () => {
      isDisposed = true;
      for (const { track, ended, mute } of trackListeners) {
        track.removeEventListener('ended', ended);
        track.removeEventListener('mute', mute);
      }
    };
  }

  /**
   * Acquires a MediaStream wrapped with resilient disconnection and hot-swap recovery guards.
   */
  public async acquireResilientStream(
    constraints?: MediaStreamConstraints
  ): Promise<ResilientStreamHandle> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('navigator.mediaDevices.getUserMedia is unavailable in this environment');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints || { audio: true });
    } catch (err: any) {
      const diagnostic = MicrophonePermissionManager.diagnose(err);
      console.warn(`[AudioDeviceManager] Microphone acquisition failed: ${diagnostic.title}`, diagnostic.actionSteps);
      const enhancedError = new Error(`${diagnostic.title}: ${diagnostic.explanation}`);
      (enhancedError as any).name = err?.name || 'MicrophoneAcquisitionError';
      (enhancedError as any).diagnostic = diagnostic;
      throw enhancedError;
    }
    const dropListeners: Set<AudioDeviceDropListener> = new Set();

    const activeTrack = stream.getAudioTracks()[0];
    let activeDevice: MediaDeviceInfo | null = null;

    try {
      const inputs = await this.getAudioInputDevices();
      const trackDeviceId = activeTrack?.getSettings?.().deviceId;
      activeDevice = inputs.find(d => d.deviceId === trackDeviceId) || inputs[0] || null;
    } catch {}

    const detachGuard = this.attachTrackDisconnectGuard(stream, (event) => {
      if (event.recovered && event.fallbackDevice) {
        activeDevice = event.fallbackDevice;
      }
      for (const listener of dropListeners) {
        try {
          listener(event);
        } catch (e) {
          console.warn('[AudioDeviceManager] Error in stream drop listener:', e);
        }
      }
    }, { autoRecover: true });

    return {
      stream,
      get activeDevice() {
        return activeDevice;
      },
      disconnect: () => {
        detachGuard();
        stream.getTracks().forEach(t => {
          try { t.stop(); } catch {}
        });
      },
      onDeviceDrop: (listener: AudioDeviceDropListener) => {
        dropListeners.add(listener);
        return () => {
          dropListeners.delete(listener);
        };
      }
    };
  }
}

export const audioDeviceManager = new AudioDeviceManager();
