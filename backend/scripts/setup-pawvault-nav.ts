/**
 * setup-pawvault-nav.ts
 * Updates Shopify navigation to point to real pet collections.
 * Run: npx ts-node scripts/setup-pawvault-nav.ts
 */

import 'dotenv/config';
import { cjShopifyUsaAdminService } from '../src/modules/cj-shopify-usa/services/cj-shopify-usa-admin.service';
import { prisma } from '../src/config/database';

const USER_ID = 1;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return cjShopifyUsaAdminService.graphql<T>({ userId: USER_ID, query, variables });
}

// Desired nav structure
const DESIRED_NAV = [
  { title: 'Home',          url: '/'                          },
  { title: 'Dogs',          url: '/collections/dogs'          },
  { title: 'Cats',          url: '/collections/cats'          },
  { title: 'Grooming',      url: '/collections/grooming'      },
  { title: 'Toys',          url: '/collections/toys'          },
  { title: 'New Arrivals',  url: '/collections/new-arrivals'  },
  { title: 'All Products',  url: '/collections/all'           },
  { title: 'Contact',       url: '/pages/contact'             },
];

async function main() {
  console.log('🧭 Updating PawVault navigation...\n');

  // 1. Fetch current menus
  const menusRes = await gql<{
    menus: { edges: Array<{ node: { id: string; title: string; handle: string; items: Array<{ id: string; title: string; url: string }> } }> };
  }>(
    `query { menus(first: 10) { edges { node { id title handle items { id title url } } } } }`,
  );

  const menus = menusRes.menus.edges.map(e => e.node);
  console.log('Current menus:');
  menus.forEach(m => console.log(`  ${m.handle} — ${m.title} (${m.items.length} items)`));

  // Find the main-menu (or first menu)
  const mainMenu = menus.find(m => m.handle === 'main-menu') || menus[0];
  if (!mainMenu) {
    console.log('No menus found — creating main-menu...');
    // Create a new menu
    const createRes = await gql<{
      menuCreate: { menu?: { id: string }; userErrors: { message: string }[] };
    }>(
      `mutation CreateMenu($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
        menuCreate(title: $title, handle: $handle, items: $items) {
          menu { id }
          userErrors { message }
        }
      }`,
      {
        title: 'Main Menu',
        handle: 'main-menu',
        items: DESIRED_NAV.map(item => ({ title: item.title, url: item.url, type: 'HTTP' })),
      },
    );
    const errors = createRes.menuCreate.userErrors;
    if (errors.length) console.log('Errors:', errors.map(e => e.message).join('; '));
    else console.log('✓ Main menu created');
    return;
  }

  console.log(`\nUpdating menu: ${mainMenu.title} (${mainMenu.id})`);

  // Delete existing items and create new ones via menuUpdate
  const updateRes = await gql<{
    menuUpdate: { menu?: { id: string; title: string }; userErrors: { message: string }[] };
  }>(
    `mutation UpdateMenu($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id title }
        userErrors { field message }
      }
    }`,
    {
      id: mainMenu.id,
      title: mainMenu.title,
      items: DESIRED_NAV.map(item => ({ title: item.title, url: item.url, type: 'HTTP' })),
    },
  );

  const errors = updateRes.menuUpdate.userErrors;
  if (errors.length) {
    console.log('⚠️  menuUpdate errors:', errors.map(e => e.message).join('; '));
    console.log('\nFalling back: deleting old items and creating new ones...');

    // Delete all existing items first
    for (const item of mainMenu.items) {
      await gql<unknown>(
        `mutation DeleteItem($id: ID!) { menuItemDelete(id: $id) { deletedMenuItemId userErrors { message } } }`,
        { id: item.id },
      );
      process.stdout.write('.');
    }

    // Create new items
    for (const nav of DESIRED_NAV) {
      await gql<unknown>(
        `mutation CreateItem($menuId: ID!, $title: String!, $url: String!) {
          menuItemCreate(menuId: $menuId, title: $title, url: $url, type: HTTP) {
            menuItem { id title }
            userErrors { message }
          }
        }`,
        { menuId: mainMenu.id, title: nav.title, url: nav.url },
      );
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('\n✓ Items replaced');
  } else {
    console.log(`✓ Menu updated: ${updateRes.menuUpdate.menu?.title}`);
  }

  // Show final state
  const finalRes = await gql<{
    menu: { items: Array<{ title: string; url: string }> } | null;
  }>(
    `query { menu(handle: "main-menu") { items { title url } } }`,
  );

  console.log('\nFinal navigation:');
  (finalRes.menu?.items ?? []).forEach(item =>
    console.log(`  ${item.title.padEnd(16)} → ${item.url}`),
  );
}

main()
  .catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
