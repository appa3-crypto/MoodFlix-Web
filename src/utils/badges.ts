import type { UserProfile, Recommendation } from '../types';

export interface Badge {
  id:          string;
  emoji:       string;
  title:       string;
  description: string;
  earned:      boolean;
  secret?:     boolean;
}

interface BadgeDef {
  id:          string;
  emoji:       string;
  title:       string;
  description: string;
  check:       (profile: UserProfile, allItems: Recommendation[]) => boolean;
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: 'first-watch',
    emoji: '🍿',
    title: 'Premier soir',
    description: 'Premier contenu regardé',
    check: p => p.seenItems.filter(id => id < 9001).length >= 1,
  },
  {
    id: 'ten-seen',
    emoji: '🎬',
    title: 'Habitué',
    description: '10 films ou séries regardés',
    check: p => p.seenItems.filter(id => id < 9001).length >= 10,
  },
  {
    id: 'five-liked',
    emoji: '❤️',
    title: 'Coup de cœur',
    description: '5 contenus aimés',
    check: p => p.likedItems.length >= 5,
  },
  {
    id: 'twenty-five-liked',
    emoji: '💎',
    title: 'Grand fan',
    description: '25 contenus aimés',
    check: p => p.likedItems.length >= 25,
  },
  {
    id: 'comedy-lover',
    emoji: '😂',
    title: 'Amateur de comédie',
    description: 'Fan de films qui font rire',
    check: p => (p.frequentMoods.laugh ?? 0) >= 5,
  },
  {
    id: 'thriller-fan',
    emoji: '😱',
    title: 'Fan de thrillers',
    description: 'Tu aimes les sensations fortes',
    check: p => (p.frequentMoods.scared ?? 0) >= 5,
  },
  {
    id: 'mind-bender',
    emoji: '🌀',
    title: 'Casse-cerveau',
    description: 'Tu cherches à retourner ton cerveau',
    check: p => (p.frequentMoods['mind-bending'] ?? 0) >= 5,
  },
  {
    id: 'marathoner',
    emoji: '📺',
    title: 'Marathonien',
    description: '3 séries dans ton historique',
    check: (p, allItems) => {
      const itemMap = new Map(allItems.map(i => [i.id, i]));
      const seriesSeen = p.seenItems.filter(id => {
        const meta = p.itemMetaStore[id];
        const item = itemMap.get(id);
        return (meta?.type ?? item?.type) === 'series';
      });
      return seriesSeen.length >= 3;
    },
  },
  {
    id: 'calibrated',
    emoji: '🎯',
    title: 'Bien calibré',
    description: 'Tu as calibré tes goûts',
    check: p => p.likedItems.some(id => id >= 9001) || p.dislikedItems.some(id => id >= 9001),
  },
  {
    id: 'critic',
    emoji: '⭐',
    title: 'Critique',
    description: '10 contenus notés',
    check: p => p.satisfactionLog.length >= 10,
  },
  {
    id: 'explorer',
    emoji: '🔍',
    title: 'Explorateur',
    description: 'Une découverte dans tes recommandations',
    check: p => p.recommendedHistory.length >= 15,
  },
  {
    id: 'satisfied',
    emoji: '😍',
    title: 'Comblé',
    description: '5 contenus adorés',
    check: p => p.satisfactionLog.filter(e => e.rating === 'loved').length >= 5,
  },
];

export function computeBadges(profile: UserProfile, allItems: Recommendation[]): Badge[] {
  return BADGE_DEFS.map(def => ({
    id:          def.id,
    emoji:       def.emoji,
    title:       def.title,
    description: def.description,
    earned:      def.check(profile, allItems),
  }));
}
