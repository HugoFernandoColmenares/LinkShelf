import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'links' },
      {
        path: 'links',
        loadComponent: () => import('./features/library/library-page').then((m) => m.LibraryPage),
      },
      {
        path: 'links/new',
        loadComponent: () => import('./features/save/save-link-page').then((m) => m.SaveLinkPage),
      },
      {
        path: 'links/:id',
        loadComponent: () =>
          import('./features/detail/link-detail-page').then((m) => m.LinkDetailPage),
      },
    ],
  },
  { path: '**', redirectTo: 'links' },
];
