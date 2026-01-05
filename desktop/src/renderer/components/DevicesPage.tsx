import React from 'react';
import { useAppStore } from '../store';
import { colors, pressableStyle, pressableHandlers } from '../utils/styles';

export const DevicesPage: React.FC = () => {
  const { state, loadDevices, selectDevice, capture } = useAppStore();

  React.useEffect(() => {
    console.log('DevicesPage mounted, loading devices...');
    loadDevices();
  }, []);

  const loadDump = async () => {
    if (!window.groundview?.dialog?.openDump) return;
    const res = await window.groundview.dialog.openDump();
    if (res?.ok && res.dump) {
      // setPhase는 store에서 처리
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: colors.textMain }}>GroundView</div>
        <img
          src="file:///C:/GroundView/Gemini_AI%20Logo.png"
          alt="Gemini AI Logo"
          style={{ height: 60, objectFit: 'contain', marginLeft: 12 }}
        />
      </div>
      <div style={{ marginBottom: 20, color: colors.textSub }}>ADB/WDA capture & locator generator</div>
      
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ADB FOUND Section */}
        <div
          style={{
            background: colors.cardBlue,
            border: '1px solid #dbe7ff',
            borderRadius: 14,
            padding: 16
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#4ade80',
                border: '1px solid #bbf7d0'
              }}
            />
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>ADB FOUND</div>
          </div>
          <div style={{ color: colors.textSub, marginBottom: 10 }}>Available Android Debug Bridge Information</div>
          <div
            style={{
              background: 'white',
              border: '1px solid #dce3f5',
              borderRadius: 10,
              padding: 12,
              color: colors.textMain,
              fontFamily: 'monospace'
            }}
          >
            $ {state.health?.details?.split('\n')[0] || (state.adbPath ? 'Fetching ADB version...' : 'Set ADB path to fetch version.')}
            {state.adbPath && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>path: {state.adbPath}</div>
            )}
          </div>
        </div>

        {/* Connected Devices Section */}
        <div
          style={{
            background: colors.cardGreen,
            border: '1px solid #c8f5d3',
            borderRadius: 14,
            padding: 16
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    background: '#22c55e'
                  }}
                />
                <div style={{ fontSize: 20, fontWeight: 800, color: colors.textMain }}>Connected Devices</div>
              </div>
              <div style={{ color: colors.textSub, marginTop: 6 }}>{state.devices.length} device(s) found</div>
            </div>
            <button
              onClick={loadDevices}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #b7f0c2',
                background: '#fff',
                color: '#16a34a',
                cursor: 'pointer',
                fontWeight: 700,
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Refresh
            </button>
          </div>

          <div
            style={{
              marginTop: 14,
              background: '#f8fff9',
              border: '1px dashed #c8f5d3',
              borderRadius: 12,
              padding: 16,
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontWeight: 600,
              textAlign: 'center'
            }}
          >
            {state.devices.length === 0 ? (
              <div>
                <div style={{ fontSize: 32, marginBottom: 4 }}>📱</div>
                No devices connected
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Connect via USB or enable ADB over WiFi.
                </div>
              </div>
            ) : (
              <div style={{ width: '100%', maxWidth: 640, textAlign: 'left', color: '#0f172a' }}>
                <div style={{ marginBottom: 10, color: '#475569' }}>Select Device</div>
                <select
                  value={state.selectedDevice?.id || ''}
                  onChange={(e) => selectDevice(e.target.value)}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #c8f5d3',
                    marginBottom: 12,
                    fontSize: 14
                  }}
                >
                  <option value="">Choose a device...</option>
                  {state.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name || d.id}
                    </option>
                  ))}
                </select>
                {!state.selectedDevice && (
                  <div
                    style={{
                      background: '#f8dadd',
                      border: '1px solid #f6c8cd',
                      padding: 12,
                      borderRadius: 10,
                      color: '#b91c1c',
                      marginBottom: 12
                    }}
                  >
                    Select a device to capture.
                  </div>
                )}
                {state.selectedDevice && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {state.capturing ? (
                      <div
                        style={{
                          background: '#fee2e2',
                          border: '1px solid #fecdd3',
                          padding: 14,
                          borderRadius: 10,
                          color: '#b91c1c',
                          textAlign: 'center',
                          fontWeight: 800
                        }}
                      >
                        ★ Capturing...
                      </div>
                    ) : (
                      <button
                        onClick={capture}
                        style={{
                          width: '100%',
                          padding: '14px 12px',
                          borderRadius: 10,
                          border: 'none',
                          background: '#ef4444',
                          color: '#fff',
                          fontWeight: 800,
                          cursor: 'pointer',
                          ...pressableStyle
                        }}
                        {...pressableHandlers}
                      >
                        Capture Screen
                      </button>
                    )}
                    <button
                      onClick={loadDump}
                      style={{
                        width: '100%',
                        padding: '14px 12px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        fontWeight: 800,
                        cursor: 'pointer',
                        ...pressableStyle
                      }}
                      {...pressableHandlers}
                    >
                      Load ZIP File
                    </button>
                    <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                      Ready to capture from: {state.selectedDevice.id}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
