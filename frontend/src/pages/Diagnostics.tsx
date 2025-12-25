import { lazy } from 'react';

export default lazy(() => Promise.resolve({
  default: () => <div>Diagnostics - Coming Soon</div>
}));
