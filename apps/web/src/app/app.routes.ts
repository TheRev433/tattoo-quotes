import type { Routes } from '@angular/router';
import { requireArtist } from './core/artist-session';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Tattoo Quotes',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'request',
    title: 'Request a quote · Tattoo Quotes',
    loadComponent: () => import('./features/request-form/request-form.page').then((m) => m.RequestFormPage),
  },
  {
    path: 'r/:token',
    title: 'Your quote request · Tattoo Quotes',
    loadComponent: () => import('./features/client-request/client-request.page').then((m) => m.ClientRequestPage),
  },
  {
    path: 'artist',
    title: 'Artist sign-in · Tattoo Quotes',
    loadComponent: () => import('./features/artist/pick-artist.page').then((m) => m.PickArtistPage),
  },
  {
    path: 'artist/inbox',
    title: 'Inbox · Tattoo Quotes',
    canActivate: [requireArtist],
    loadComponent: () => import('./features/artist/inbox.page').then((m) => m.InboxPage),
  },
  {
    path: 'artist/requests/:id',
    title: 'Request · Tattoo Quotes',
    canActivate: [requireArtist],
    loadComponent: () => import('./features/artist/request-detail.page').then((m) => m.RequestDetailPage),
  },
  { path: '**', redirectTo: '' },
];
