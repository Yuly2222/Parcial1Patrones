// Fix conocido de Leaflet + bundlers (Vite/Webpack): los íconos por defecto
// del marcador no se resuelven solos porque Leaflet los referencia con rutas
// relativas pensadas para un <script> plano, no para un bundle con hashing.
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: icon2x,
  iconUrl: icon,
  shadowUrl: iconShadow,
});
