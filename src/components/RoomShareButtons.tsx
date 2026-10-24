import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Link, QrCode, X } from 'lucide-react';

interface Props {
  roomId: string;
  game: 'busfahren' | 'quadrat' | 'circle';
}

export default function RoomShareButtons({ roomId, game }: Props) {
  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const url = `${window.location.origin}${window.location.pathname}?join=${roomId}&game=${game}`;

  function handleCopyCode() {
    navigator.clipboard?.writeText(roomId).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }).catch(() => { /* clipboard blocked - code is visible anyway */ });
  }

  function handleCopyLink() {
    navigator.clipboard?.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => setShowQr(true));
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button className="copy-btn" onClick={handleCopyCode}>
          {codeCopied
            ? <><Check size={13} strokeWidth={2.5} /> Kopiert!</>
            : <><Copy size={13} /> Code kopieren</>}
        </button>
        <button className="copy-btn" onClick={handleCopyLink}>
          {linkCopied
            ? <><Check size={13} strokeWidth={2.5} /> Link kopiert!</>
            : <><Link size={13} /> Link kopieren</>}
        </button>
        <button className="copy-btn" onClick={() => setShowQr(true)}>
          <QrCode size={13} /> QR-Code
        </button>
      </div>

      {showQr && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}
          onClick={() => setShowQr(false)}
        >
          <div
            style={{
              background: 'var(--card)', borderRadius: 20, padding: 28,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>Raum beitreten</span>
              <button
                className="icon-btn icon-btn-ghost"
                onClick={() => setShowQr(false)}
                aria-label="Schließen"
                style={{ width: 32, height: 32 }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 12 }}>
              <QRCodeSVG value={url} size={200} />
            </div>
            <div className="room-code" style={{ margin: 0, fontSize: 22 }}>{roomId}</div>
          </div>
        </div>
      )}
    </>
  );
}
