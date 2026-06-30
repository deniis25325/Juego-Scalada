import { useEffect, useRef } from 'react'

export default function GoogleAd({ slot }) {
  const initializedRef = useRef(false);

  useEffect(() => {
    // 1. Asegurar la existencia del array de adsbygoogle en window
    window.adsbygoogle = window.adsbygoogle || [];

    // 2. Empujar la unidad de anuncio de forma segura si no se inicializó en este ciclo
    if (!initializedRef.current) {
      initializedRef.current = true;
      try {
        window.adsbygoogle.push({});
      } catch (e) {
        console.log('AdSense push unit is not ready or blocked:', e);
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

  const clientPubId = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-5536356974720104';

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
