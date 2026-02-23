export const SHORT_REVALIDATE_SECONDS = 20;

export const SHORT_PRIVATE_CACHE_CONTROL = `private, max-age=${SHORT_REVALIDATE_SECONDS}, stale-while-revalidate=${SHORT_REVALIDATE_SECONDS * 2}`;
