import React from 'react';
import { pressableStyle, pressableHandlers } from '../utils/styles';

interface InfoModalProps {
  onClose: () => void;
  appVersion: string;
}

export const InfoModal: React.FC<InfoModalProps> = ({ onClose, appVersion }) => {
  const [licenseView, setLicenseView] = React.useState<{ name: string; text: string } | null>(null);

  const ossLicenses = [
    {
      name: 'Electron',
      version: '28.x',
      license: 'MIT',
      text: `MIT License

Copyright (c) Electron contributors
Copyright (c) 2013-2020 GitHub Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
      name: 'React',
      version: '18.x',
      license: 'MIT',
      text: `MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
      name: 'FastAPI',
      version: '0.x',
      license: 'MIT',
      text: `MIT License

Copyright (c) 2018 Sebastián Ramírez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    },
    {
      name: 'TypeScript',
      version: '5.x',
      license: 'Apache 2.0',
      text: `Apache License
Version 2.0, January 2004

Copyright (c) Microsoft Corporation.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.`
    },
    {
      name: 'Vite',
      version: '5.x',
      license: 'MIT',
      text: `MIT License

Copyright (c) 2019-present Evan You & Vite Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
    }
  ];

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: '#0b1221',
            border: '1px solid #1f2937',
            borderRadius: 12,
            padding: 16,
            width: 520,
            maxWidth: '90%',
            color: '#e5e7eb',
            boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>GroundView 정보</div>
              <div style={{ color: '#9ca3af', fontSize: 12 }}>버전 {appVersion} · 만든 사람: QA Bulls</div>
            </div>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: '#111827',
                color: '#e5e7eb',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                ...pressableStyle
              }}
              {...pressableHandlers}
            >
              Close
            </button>
          </div>
          <div style={{ marginBottom: 12, fontWeight: 700 }}>오픈소스 라이선스</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ossLicenses.map((lic) => (
              <div
                key={lic.name}
                style={{
                  background: '#0e1726',
                  border: '1px solid #1f2937',
                  borderRadius: 8,
                  padding: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{lic.name}</div>
                  <div style={{ color: '#9ca3af', fontSize: 12 }}>
                    v{lic.version} · {lic.license}
                  </div>
                </div>
                <button
                  onClick={() => setLicenseView({ name: lic.name, text: lic.text })}
                  style={{
                    border: '1px solid #1f2937',
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: 6,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    ...pressableStyle
                  }}
                  {...pressableHandlers}
                >
                  전문 보기
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {licenseView && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1150
          }}
          onClick={() => setLicenseView(null)}
        >
          <div
            style={{
              background: '#0b1221',
              border: '1px solid #1f2937',
              borderRadius: 12,
              padding: 16,
              width: 640,
              maxWidth: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              color: '#e5e7eb',
              boxShadow: '0 16px 60px rgba(0,0,0,0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{licenseView.name} 라이선스</div>
              <button
                onClick={() => setLicenseView(null)}
                style={{
                  border: 'none',
                  background: '#111827',
                  color: '#e5e7eb',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                  ...pressableStyle
                }}
                {...pressableHandlers}
              >
                Close
              </button>
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 12,
                color: '#9ca3af',
                background: '#0e1726',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: 12,
                margin: 0
              }}
            >
              {licenseView.text}
            </pre>
          </div>
        </div>
      )}
    </>
  );
};
