/**
 * selectors.js - CSS selectors for different social media platforms
 * 
 * This module provides platform-specific selectors for extracting data from
 * social media sites, organized by platform and element type.
 */

const SELECTORS = {
  // Facebook selectors
  facebook: {
    posts: [
      '[data-pagelet^="FeedUnit"]',
      '[role="feed"] > div',
      '.x1lliihq',
      '.x1qjc9v5',
      'div[data-pagelet^="Feed"]',
      'div[role="article"]',
      'div.x1yztbdb:not([role])',
      'div[data-ad-preview="message"]'
    ],
    content: [
      '[data-ad-comet-preview="message"]',
      '[data-ad-preview="message"]',
      '[dir="auto"]',
      '.xdj266r',
      '.x11i5rnm',
      'div.x1iorvi4',
      'span.x193iq5w'
    ],
    user: [
      'h3.x1heor9g span',
      'h4 span.x193iq5w',
      'a.x1i10hfl[role="link"] span',
      'span.x193iq5w a',
      '.x1heor9g > a'
    ],
    images: [
      'img[src*="scontent"]',
      'div.x1qjc9v5 img.x1bwycvy',
      'a[role="link"] img.x1ey2m1c',
      'div.x78zum5 div.xdt5ytf div.xu3j5b3 img'
    ],
    engagement: {
      likes: [
        '[aria-label*="reaction"]',
        '[aria-label*="Like"]',
        'span.x16hj40l',
        'span.xt0b8zv[role="button"]'
      ],
      comments: [
        '[aria-label*="comment"]',
        'span.x1s688f',
        'span.x1s688f span.x193iq5w'
      ],
      shares: [
        '[aria-label*="share"]',
        'span.x1s688f + span.x1s688f'
      ]
    },
    sponsored: [
      'span:contains("Sponsored")',
      'a[href*="ads"]',
      '[aria-label*="sponsor"]',
      'span.x1yc453h'
    ]
  },
  
  // Instagram selectors
  instagram: {
    posts: [
      'article[role="presentation"]',
      'div._ab6k', 
      'div._aagw',
      'article._ab6k',
      'article',
      'div._aabd',
      'div.x1qjc9v5',
      '.x1y1aw1k',
      'div[style*="padding-bottom: 177.778%"]',
      // More flexible selectors
      '[data-visualcompletion="media-vc-image"]',
      'div[style*="position: relative"] > div[role="button"]',
      'div[style*="padding-bottom"]',
      // Reels-specific selectors
      'div[data-visualcompletion="media"] > div > div',
      'div[data-media-type="GraphVideo"]'
    ],
    content: [
      'div._a9zs', 
      'div._a9zr', 
      'span._aacl', 
      'div._a9zr div',
      'span[class*="x193iq5w"]', 
      'div[dir="auto"] span', 
      'div.x1lliihq', 
      'h1 + div',
      'div[role="button"] + div span', // New pattern
      'span[dir="auto"]', // For alt text/captions
      'div[style*="padding-bottom"] + div', // For some layouts
      'a[role="link"] + div' // Feed captions
    ],
    user: [
      'a.notranslate', 
      'a.x1i10hfl', 
      'div._aaqt', 
      'h2',
      'span.x1lliihq', 
      'a[role="link"]', 
      'header a',
      'a[tabindex="0"]',
      'div[style*="flex-direction: row"] a',
      'h2 + div a',
      'a[href*="/"]'
    ],
    images: [
      'img[srcset]',
      'img[src*=".cdninstagram.com"]',
      'div._aagv img',
      'img.x5yr21d',
      'video[src*=".cdninstagram.com"]'
    ],
    engagement: {
      likes: [
        'section span', 
        'section div a span', 
        'span._aacl',
        'div._aacl._aaco._aacw._aad0._aad6', 
        'a[href*="liked_by"]',
        'div.x78zum5 span', 
        'div[role="button"] + a',
        'div[role="button"]:has(svg) + div span',
        'div.x1qjc9v5'
      ],
      comments: [
        'span._ae5q',
        'a.x1i10hfl[href*="comments"]',
        'div._ae2s + div._ae3w',
        'div._ae5q'
      ]
    },
    sponsored: [
      'span:contains("Sponsored")', 
      'span:contains("Paid partnership")',
      'a[href*="ads"]',
      'div._ab2z'
    ]
  },
  
  // LinkedIn selectors
  linkedin: {
    posts: [
      '.feed-shared-update-v2',
      '.occludable-update',
      '.update-components-actor',
      '.scaffold-finite-scroll__content > div > div',
      '.feed-shared-card',
      '.feed-shared-update',
      '.ember-view.occludable-update',
      '.feed-shared-update-v2__description-wrapper'
    ],
    content: [
      '.feed-shared-update-v2__description',
      '.feed-shared-text',
      '.break-words',
      '.update-components-text',
      '.feed-shared-update__description',
      '.feed-shared-text__text-view',
      'span.break-words',
      'div.feed-shared-inline-show-more-text'
    ],
    user: [
      '.feed-shared-actor__name',
      '.update-components-actor__name',
      '.feed-shared-actor__title',
      '.update-components-actor__meta a[data-control-name="actor"]',
      'a[data-control-name="actor_container"] span',
      '.feed-shared-actor__container span',
      '.feed-shared-actor__name span',
      '.feed-shared-actor__sub-description'
    ],
    images: [
      'img[src*="media.licdn.com"]',
      '.feed-shared-image__container img',
      '.feed-shared-article__preview-image',
      '.update-components-image img',
      '.feed-shared-carousel__slide img',
      '.ivm-image-view-model img',
      '.feed-shared-mini-update-v2__card-image'
    ],
    engagement: {
      likes: [
        '.social-details-social-counts__reactions-count',
        '.social-details-social-counts__count-value',
        '.feed-shared-social-action-bar__action-button[aria-label*="like"] span',
        '.update-components-social-activity-count span',
        '.social-details-social-activity'
      ],
      comments: [
        '.social-details-social-counts__comments-count',
        '.feed-shared-social-action-bar__action-button[aria-label*="comment"] span',
        '.update-components-social-activity-count--has-comments',
        '.feed-shared-social-counts__comments'
      ]
    },
    sponsored: [
      'span.feed-shared-actor__sub-description:contains("Promoted")',
      'span:contains("Sponsored")',
      'span.update-components-actor__description:contains("Promoted")',
      '.feed-shared-actor__supplementary-actor-info:contains("Promoted")',
      '.update-components-actor__supplementary:contains("Promoted")'
    ],
    jobPost: [
      '.job-card',
      'span:contains("hiring")',
      'span:contains("job opening")',
      'span:contains("apply now")',
      'span:contains("we are looking for")'
    ]
  }
};

export default SELECTORS; 