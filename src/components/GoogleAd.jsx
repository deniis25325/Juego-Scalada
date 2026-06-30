import { useEffect, useRef } from 'react'

export default function GoogleAd({ slot }) {
  const initializedRef = useRef(false);

  useEffect(() => {
    // 1. Cargar el script de forma única
    const clientID = import.meta.env.VITE_ADSENSE_CLIENT_ID;
    if (clientID) {
      const existingScript = document.querySelector('script[src*="adsbygoogle"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientID}`;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
    }

    // 2. Empujar la unidad de anuncio si aún no se inicializó
    if (!initializedRef.current) {
      initializedRef.current = true;
      try {
        if (window.adsbygoogle) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        }
      } catch (e) {
        console.log('AdSense unit is not ready or blocked:', e);
      }
    }
  }, [slot]);

  // Determinar IDs de slots y el ID del cliente
  const adSlotId = 
    slot === 'menu' ? '2345678901' : 
    slot === 'gameOver' ? '3456789012' : 
    slot === 'left' ? '4567890123' : 
    slot === 'right' ? '5678901234' : 
    '0987654321';

  const clientPubId = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-XXXXXXXXXXXXXXXX';

  return (
    <div className={`google-ad-wrap ad-slot-${slot}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={clientPubId}
        data-ad-slot={adSlotId}
        data-ad-format={slot === 'left' || slot === 'right' ? 'vertical' : 'horizontal'}
        data-full-width-responsive="true"
      />
      <div className="google-ad-placeholder">
        <span>PUBLICIDAD</span>
        Anuncio Google AdSense ({slot})
      </div>
    </div>
  )
}
