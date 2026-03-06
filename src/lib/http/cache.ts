export const SHORT_REVALIDATE_SECONDS = 20;
export const PRIVATE_STALE_WHILE_REVALIDATE_SECONDS = 300;

export const SHORT_PRIVATE_CACHE_CONTROL = `private, max-age=${SHORT_REVALIDATE_SECONDS}, stale-while-revalidate=${SHORT_REVALIDATE_SECONDS * 2}`;
export const PRIVATE_SWR_CACHE_CONTROL = `private, max-age=0, stale-while-revalidate=${PRIVATE_STALE_WHILE_REVALIDATE_SECONDS}`;
