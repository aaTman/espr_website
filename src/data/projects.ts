export interface Project {
  slug: string;
  name: string;
  blurb: string;
  url: string;
  // Temporary: crop the app's own site nav until it hides it when embedded.
  cropLegacyNav?: boolean;
}

export const projects: Project[] = [
  {
    slug: 'fronts',
    name: 'Fronts',
    blurb: 'Machine-learned weather front detection.',
    url: 'https://fronts.espr.ai',
  },
  {
    slug: 'spread-anomaly',
    name: 'Spread Anomaly',
    blurb: 'Ensemble spread anomalies.',
    url: 'https://spreadanomaly.espr.ai',
    cropLegacyNav: true,
  },
];
