import { applyTheme, theme } from './state.js';
import './components/sw-app.js';

applyTheme(theme.get());
