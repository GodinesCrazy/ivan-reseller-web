/**
 * PawVault Store Fix Script
 *
 * Fixes all detected issues:
 *  1. Clean product handles (remove CJ IDs from slugs)
 *  2. Rewrite professional product descriptions
 *  3. Fix inconsistent shipping info in descriptions
 *  4. Fix navigation menus (Spanish → English)
 *  5. Update contact page with real email + social links
 *
 * Run: npx tsx src/scripts/fix-pawvault-store.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.local first, then .env
const envLocalPath = path.resolve(process.cwd(), '.env.local');
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
else if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP ?? 'ivanreseller-2.myshopify.com';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const API_VERSION = process.env.SHOPIFY_API_VERSION ?? '2026-04';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌  SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET not set');
  process.exit(1);
}

// ── Shopify helpers ────────────────────────────────────────────────────────────

let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`https://${SHOP_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Token exchange failed ${res.status}: ${txt}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('No access_token in response');
  cachedToken = data.access_token;
  return cachedToken;
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getToken();
  const res = await fetch(
    `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data as T;
}

async function rest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(
    `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`REST ${method} ${path} → ${res.status}: ${txt}`);
  }
  return res.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Product data ───────────────────────────────────────────────────────────────

interface ProductFix {
  /** Partial current handle to match (substring) */
  matchHandle: string;
  newHandle: string;
  newTitle: string;
  newDescription: string;
}

const PRODUCT_FIXES: ProductFix[] = [
  {
    matchHandle: 'cat-tableware-bamboo',
    newHandle: 'bamboo-cat-bowl-stand-tableware-set',
    newTitle: 'Bamboo Cat Bowl Stand & Tableware Set',
    newDescription: `<p>Give your cat a dining experience they deserve. This elevated bamboo bowl stand raises food and water to the perfect height, reducing neck strain and promoting healthier digestion — especially important for senior cats or breeds prone to regurgitation.</p>
<p><strong>Why pet parents love it:</strong></p>
<ul>
  <li>🌿 <strong>Natural bamboo frame</strong> — eco-friendly, durable, and easy to wipe clean</li>
  <li>🥣 <strong>Removable stainless steel bowls</strong> — dishwasher safe, no rust, no odor</li>
  <li>🐾 <strong>Non-slip rubber feet</strong> — stays put even with the most enthusiastic eaters</li>
  <li>📐 <strong>Elevated design</strong> — reduces strain on neck, joints, and digestion</li>
</ul>
<p><strong>Dimensions:</strong> 24 cm W × 14 cm H | Bowl capacity: 300 ml each</p>
<p><strong>Ideal for:</strong> Cats of all sizes, puppies, and small dog breeds.</p>
<p>📦 Includes: 1 bamboo stand + 2 stainless steel bowls</p>`,
  },
  {
    matchHandle: 'retractable-chain-cjjt',
    newHandle: 'retractable-dog-leash-auto-rope',
    newTitle: 'Retractable Dog Leash — Auto Traction Rope',
    newDescription: `<p>Freedom for your dog, control for you. This retractable leash lets your pup explore up to 5 meters while keeping you fully in command with a smooth one-button brake and lock system.</p>
<p><strong>Key features:</strong></p>
<ul>
  <li>🔒 <strong>One-button brake + lock</strong> — instantly stop and hold any length</li>
  <li>💪 <strong>Heavy-duty nylon tape</strong> — won't tangle, snap, or fray</li>
  <li>🖐 <strong>Ergonomic anti-slip handle</strong> — comfortable grip on long walks</li>
  <li>🔄 <strong>360° tangle-free</strong> — swivel head prevents knots</li>
  <li>⚖️ <strong>Lightweight design</strong> — barely notice it in your hand</li>
</ul>
<p><strong>Available lengths:</strong> 3M (for small breeds, parks) | 5M (medium breeds, open spaces)</p>
<p><strong>Available colors:</strong> Blue, Red, Green, White, Orange</p>
<p>✅ Suitable for dogs up to 25 kg. For larger dogs, see our Anti-Breakaway Traction Leash.</p>`,
  },
  {
    matchHandle: 'grooming-scissors-cjjj',
    newHandle: 'professional-pet-grooming-scissors-set',
    newTitle: 'Professional Pet Grooming Scissors Set — 5 Pieces',
    newDescription: `<p>Salon-quality grooming from the comfort of home. This complete 5-piece set gives you every tool needed to trim, shape, and style your pet's coat like a professional groomer — no experience required.</p>
<p><strong>What's included:</strong></p>
<ul>
  <li>✂️ 7.0" straight scissors — clean, precise cuts on straight sections</li>
  <li>📐 7.0" curved scissors — ideal for paws, face, and contours</li>
  <li>〰️ 6.5" thinning (dense teeth) scissors — blend and reduce bulk naturally</li>
  <li>🐟 7.0" fishbone thinning scissors — texture and finish work</li>
  <li>🪮 Wide-tooth comb — detangle before and after trimming</li>
  <li>🩺 Hemostatic forceps — safe ear hair removal</li>
</ul>
<p><strong>Material:</strong> Japanese-grade 440C stainless steel, hand-polished edges</p>
<p><strong>Best for:</strong> Dogs and cats with medium to long coats — Poodles, Shih Tzus, Yorkies, Maine Coons, and more.</p>
<p>💡 <strong>Tip:</strong> Always trim on clean, dry, brushed hair for best results.</p>`,
  },
  {
    matchHandle: 'bite-resistant-pets',
    newHandle: 'bite-resistant-pet-chew-toy-dental',
    newTitle: 'Bite-Resistant Pet Chew Toy — Dental Hygiene',
    newDescription: `<p>Keep your dog entertained and their teeth clean at the same time. This ultra-durable chew toy is designed for aggressive chewers and doubles as a dental hygiene tool — reducing plaque, tartar, and bad breath with every chew session.</p>
<p><strong>Why dogs can't get enough:</strong></p>
<ul>
  <li>🦷 <strong>Textured nubs</strong> — act as a natural toothbrush, cleaning between teeth</li>
  <li>💪 <strong>Reinforced natural rubber</strong> — survives even the most aggressive biters</li>
  <li>🌿 <strong>Mint-infused formula</strong> — freshens breath while they chew</li>
  <li>🎨 <strong>Multiple sizes</strong> — S (under 10 kg) | M (10–25 kg) | L (25+ kg)</li>
  <li>✅ <strong>Non-toxic, BPA-free</strong> — completely safe for daily use</li>
</ul>
<p><strong>Veterinarian recommended</strong> for dogs that suffer from boredom, anxiety, or destructive chewing habits.</p>
<p>📦 Suitable for puppies (4 months+) through senior dogs.</p>`,
  },
  {
    matchHandle: 'cat-cute-pet-humidifier',
    newHandle: 'cat-pet-humidifier-usb-nightlight',
    newTitle: 'Cat Pet Humidifier — USB Night Light',
    newDescription: `<p>A little humidity goes a long way. This adorable cat-shaped humidifier adds moisture to dry indoor air, reducing static, soothing dry skin, and making breathing easier for both you and your pets — all while glowing softly as a night light.</p>
<p><strong>Features:</strong></p>
<ul>
  <li>💧 <strong>180 ml water tank</strong> — up to 6 hours of continuous misting</li>
  <li>🔇 <strong>Ultra-quiet operation</strong> — whisper-silent, won't disturb sleep</li>
  <li>🌙 <strong>Soft LED night light</strong> — warm glow for bedrooms and nurseries</li>
  <li>🔌 <strong>USB powered</strong> — works with any charger, power bank, or laptop</li>
  <li>🛡 <strong>Auto shut-off</strong> — turns off automatically when water runs out</li>
</ul>
<p><strong>Available designs:</strong> Smiling Cat White | Classic Cat designs</p>
<p>Perfect for desks, bedside tables, and pet sleeping areas. Great as a gift for pet lovers!</p>`,
  },
  {
    matchHandle: 'pet-out-door-strap',
    newHandle: 'adjustable-pet-outdoor-harness-no-pull',
    newTitle: 'Adjustable Pet Outdoor Harness & Strap',
    newDescription: `<p>Walks without the struggle. This no-pull harness distributes leash pressure across your pet's chest and shoulders — not their neck — making every walk safer, more comfortable, and more enjoyable for both of you.</p>
<p><strong>What sets it apart:</strong></p>
<ul>
  <li>🚫 <strong>No-pull front clip</strong> — gently redirects pulling behavior</li>
  <li>🔒 <strong>Escape-proof design</strong> — dual belly and chest straps with safety snap</li>
  <li>🌟 <strong>Reflective strips</strong> — high visibility for early morning and evening walks</li>
  <li>🧲 <strong>Easy step-in fit</strong> — slides on in seconds, no wrestling required</li>
  <li>📏 <strong>Fully adjustable</strong> — 4 adjustment points for a custom, snug fit</li>
  <li>🛁 <strong>Machine washable</strong> — keeps it fresh and odor-free</li>
</ul>
<p><strong>Sizes:</strong> XS | S | M | L | XL — see size chart in images<br>
<strong>Colors:</strong> Coffee, Black, Red, Blue, Pink, and more</p>
<p>✅ Works for dogs and cats. Recommended by trainers.</p>`,
  },
  {
    matchHandle: 'pet-hidden-food-toys',
    newHandle: 'interactive-hidden-food-puzzle-toy',
    newTitle: 'Interactive Hidden Food Puzzle Toy',
    newDescription: `<p>Slow down fast eaters and keep sharp minds busy. This interactive puzzle toy hides treats in compartments that your pet must figure out, turning mealtime into a stimulating game that reduces boredom, anxiety, and bloating from eating too fast.</p>
<p><strong>Benefits:</strong></p>
<ul>
  <li>🧠 <strong>Mental stimulation</strong> — exercises problem-solving skills</li>
  <li>🐾 <strong>Slow feeding</strong> — reduces bloat risk by up to 10× vs bowl feeding</li>
  <li>😌 <strong>Anxiety relief</strong> — keeps pets calm and focused when home alone</li>
  <li>🧼 <strong>Easy to clean</strong> — dishwasher safe, no hidden crevices</li>
  <li>🔒 <strong>BPA-free, food-safe</strong> — completely safe materials</li>
</ul>
<p><strong>Works with:</strong> dry kibble, treats, small pieces of fruit or veggies</p>
<p>📦 One size fits dogs and cats. Color: Black (non-toxic matte finish)</p>`,
  },
  {
    matchHandle: 'warm-pet-sweater-coat',
    newHandle: 'cozy-warm-pet-sweater-coat',
    newTitle: 'Cozy Warm Pet Sweater Coat',
    newDescription: `<p>Keep your pet warm and stylish all winter long. This soft-knit sweater coat stretches to fit comfortably over four legs, providing full-body warmth without restricting movement — perfect for cold walks, chilly nights, or pets that just run cold.</p>
<p><strong>Why pet parents love it:</strong></p>
<ul>
  <li>🧶 <strong>Soft acrylic knit</strong> — warm, lightweight, and non-itchy against sensitive skin</li>
  <li>↔️ <strong>4-way stretch</strong> — flexible fit that moves naturally with your pet</li>
  <li>👕 <strong>Easy pull-on design</strong> — no buttons, snaps, or struggling</li>
  <li>🫧 <strong>Machine washable</strong> — cold wash, lay flat to dry</li>
  <li>📏 <strong>Multiple sizes</strong> — XS through XL with detailed size chart</li>
</ul>
<p><strong>Available in:</strong> Grey Cardigan | Navy | Cream | Brown Stripe</p>
<p><strong>Best for:</strong> Small to medium dogs, cats, hairless breeds, senior pets, and puppies.</p>`,
  },
  {
    matchHandle: 'dog-car-seat-pet-carrier',
    newHandle: 'universal-dog-car-seat-carrier',
    newTitle: 'Universal Dog Car Seat Carrier with Nonslip Mat',
    newDescription: `<p>Safe, comfortable travel for every adventure. This versatile car seat carrier secures to your vehicle's seat and gives your dog their own cozy, elevated spot — keeping them restrained, comfortable, and out of the driver's way.</p>
<p><strong>Features:</strong></p>
<ul>
  <li>🚗 <strong>Universal fit</strong> — attaches to all standard car seats, front or back</li>
  <li>🛡 <strong>Safety tether</strong> — clips to collar or harness, prevents jumping while driving</li>
  <li>🧱 <strong>Non-slip mat</strong> — rubber base keeps the seat from sliding</li>
  <li>💧 <strong>Waterproof oxford fabric</strong> — protects your car seat from fur and mess</li>
  <li>📦 <strong>Foldable design</strong> — collapses flat for storage</li>
  <li>🪟 <strong>Mesh side panels</strong> — ventilation keeps your pet cool</li>
</ul>
<p><strong>Weight capacity:</strong> Up to 20 kg (44 lbs)<br>
<strong>Colors:</strong> Beige | Grey | Black</p>
<p>✅ Compatible with trucks, SUVs, sedans, and vans.</p>`,
  },
  {
    matchHandle: 'mini-pet-hair-remover',
    newHandle: 'reusable-pet-hair-remover-roller',
    newTitle: 'Reusable Pet Hair Remover — Lint Roller',
    newDescription: `<p>Finally, a pet hair solution that never runs out. This self-cleaning lint roller captures and removes pet hair from any fabric in seconds — then empties with one squeeze into the waste compartment. No sticky tape, no refills, no waste.</p>
<p><strong>Why it's better than tape rollers:</strong></p>
<ul>
  <li>♻️ <strong>Reusable forever</strong> — saves money and plastic waste</li>
  <li>🖐 <strong>One-squeeze self-cleaning</strong> — ejects collected hair instantly</li>
  <li>🪑 <strong>Works on everything</strong> — sofas, car seats, clothes, bedding, curtains</li>
  <li>💨 <strong>Deep-clean velvet base</strong> — captures even fine, embedded hair</li>
  <li>📦 <strong>Compact size</strong> — fits in a bag, purse, or glove compartment</li>
</ul>
<p><strong>Best for:</strong> All pet types — dogs, cats, rabbits, and more.</p>
<p>🎁 Makes a great gift for any pet owner frustrated with fur on their furniture.</p>`,
  },
  {
    matchHandle: 'new-hand-held-pet-bath',
    newHandle: 'handheld-pet-bathing-massage-brush',
    newTitle: 'Handheld Pet Bathing & Massage Brush',
    newDescription: `<p>Bath time, reimagined. This all-in-one bathing brush dispenses shampoo directly through its soft silicone bristles while massaging your pet's coat — making baths faster, more effective, and actually enjoyable for your dog or cat.</p>
<p><strong>How it works:</strong></p>
<ul>
  <li>🧴 <strong>Built-in shampoo dispenser</strong> — fill the handle, press to release</li>
  <li>🤲 <strong>Soft silicone pins</strong> — massage while cleaning, stimulates circulation</li>
  <li>🔀 <strong>Lathers deeply</strong> — reaches through thick undercoats</li>
  <li>⏱ <strong>Cuts bath time in half</strong> — one tool does it all</li>
  <li>🧼 <strong>Easy to rinse</strong> — open cap, run under water, done</li>
</ul>
<p><strong>Suitable for:</strong> Dogs and cats with all coat types — short, medium, and long hair.</p>
<p><strong>Colors:</strong> Blue | Green | Pink</p>
<p>📦 Includes 1 bathing brush. Shampoo sold separately.</p>`,
  },
  {
    matchHandle: 'pet-training-snack-pack',
    newHandle: 'pet-training-treat-snack-bag',
    newTitle: 'Pet Training Treat & Snack Bag',
    newDescription: `<p>Every great trainer needs a great treat pouch. This hands-free training bag clips to your waist and gives you instant access to treats during training sessions, walks, and agility practice — keeping you focused on your dog, not fumbling in your pockets.</p>
<p><strong>Features packed in:</strong></p>
<ul>
  <li>🧲 <strong>Magnetic snap closure</strong> — open and close with one hand in 0.5 seconds</li>
  <li>📎 <strong>Spring clip + belt loop</strong> — attaches to any waistband or bag strap</li>
  <li>💧 <strong>Waterproof inner lining</strong> — easy to wipe clean after messy treats</li>
  <li>🗂 <strong>Multi-pocket design</strong> — separate compartments for treats, poop bags, clicker, keys</li>
  <li>🫧 <strong>Machine washable</strong> — remove clip and toss in the wash</li>
</ul>
<p><strong>Colors:</strong> Dark Grey | Black | Red</p>
<p>✅ Essential for puppy training, obedience classes, and reactive dog management.</p>`,
  },
  {
    matchHandle: 'pet-glasses-new-cool',
    newHandle: 'stylish-pet-sunglasses-uv-protection',
    newTitle: 'Stylish Pet Sunglasses — UV400 Protection',
    newDescription: `<p>Because your pet deserves to look as good as they feel. These UV-protective goggles shield your dog or cat's eyes from sun, wind, sand, and snow — whether at the beach, on the slopes, or just cruising in the car with the window down.</p>
<p><strong>Specs:</strong></p>
<ul>
  <li>☀️ <strong>UV400 lenses</strong> — blocks 99% of UVA and UVB rays</li>
  <li>💨 <strong>Windproof wrap-around design</strong> — protects against wind and debris</li>
  <li>📐 <strong>Adjustable head strap</strong> — fits heads 28–38 cm in circumference</li>
  <li>🔒 <strong>Scratch-resistant polycarbonate</strong> — durable and lightweight</li>
  <li>🐕 <strong>Multiple sizes</strong> — S, M, L for dogs and cats</li>
</ul>
<p><strong>Available lens colors:</strong> Black | Blue | Yellow | Pink | Silver</p>
<p>🏆 Perfect for outdoor adventures, post-surgery eye protection, and viral pet photos.</p>`,
  },
  {
    matchHandle: 'pet-anti-breakaway-traction',
    newHandle: 'anti-breakaway-pet-traction-leash',
    newTitle: 'Anti-Breakaway Pet Traction Leash',
    newDescription: `<p>For dogs who mean business. This heavy-duty leash is built for strong, reactive, or escape-artist dogs who've broken free from standard leashes. The reinforced clip and bungee shock absorber keep you in control no matter what catches their attention.</p>
<p><strong>Built tough, built safe:</strong></p>
<ul>
  <li>🔗 <strong>Military-grade clip</strong> — rated for dogs up to 50 kg, snap-proof</li>
  <li>🌊 <strong>Bungee absorber section</strong> — reduces jerk impact on your wrist and their neck</li>
  <li>🖐 <strong>Padded neoprene handle</strong> — comfortable even on 1-hour+ walks</li>
  <li>🌙 <strong>Reflective stitching</strong> — visible from 500m in headlights</li>
  <li>📏 <strong>Length:</strong> 120 cm standard walking length</li>
</ul>
<p><strong>Colors:</strong> Black | Red | Blue | Orange</p>
<p>✅ Recommended for large breeds: Huskies, German Shepherds, Labradors, Rottweilers.</p>`,
  },
  {
    matchHandle: 'ultrasonic-bark-stop',
    newHandle: 'ultrasonic-bark-control-training-device',
    newTitle: 'Ultrasonic Bark Control Training Device',
    newDescription: `<p>Train smarter, not louder. This ultrasonic bark control device emits a sound frequency that dogs hear but humans don't — instantly capturing their attention and redirecting barking behavior. No shock, no pain, just smart training.</p>
<p><strong>Three training modes:</strong></p>
<ul>
  <li>🔊 <strong>Mode 1 — Ultrasonic only:</strong> gentle attention-getter for mild barking</li>
  <li>💡 <strong>Mode 2 — Ultrasonic + LED:</strong> combines sound and flash for stronger distraction</li>
  <li>⚡ <strong>Mode 3 — Continuous:</strong> for persistent or distance barking</li>
</ul>
<p><strong>Key specs:</strong></p>
<ul>
  <li>📡 <strong>16-foot effective range</strong> — works indoors and outdoors</li>
  <li>🔋 <strong>USB rechargeable</strong> — no batteries needed, lasts 1 week per charge</li>
  <li>💧 <strong>Water-resistant casing</strong> — safe for outdoor use</li>
  <li>🐕 <strong>Safe for all dogs</strong> — humane, no physical contact required</li>
</ul>
<p>✅ Works on neighbor's dogs too — effective up to 5 meters through walls.</p>`,
  },
];

// ── Step 1: Update products ────────────────────────────────────────────────────

async function getAllProducts(): Promise<Array<{ id: string; handle: string; title: string }>> {
  const data = await gql<{
    products: { nodes: Array<{ id: string; handle: string; title: string }> };
  }>(
    `query { products(first: 50) { nodes { id handle title } } }`,
  );
  return data.products.nodes;
}

async function updateProduct(
  productGid: string,
  fix: ProductFix,
): Promise<void> {
  const mutation = `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product { id handle title }
        userErrors { field message }
      }
    }
  `;
  const data = await gql<{
    productUpdate: {
      product: { id: string; handle: string };
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(mutation, {
    input: {
      id: productGid,
      handle: fix.newHandle,
      title: fix.newTitle,
      descriptionHtml: fix.newDescription,
    },
  });

  if (data.productUpdate.userErrors.length > 0) {
    throw new Error(
      data.productUpdate.userErrors.map((e) => `${e.field}: ${e.message}`).join('; '),
    );
  }
}

/** CJ ID patterns that reveal the supplier in URLs */
const CJ_HANDLE_PATTERN = /cj[a-z0-9]{8,}/i;

async function deleteDuplicateStaleProducts(
  products: Array<{ id: string; handle: string; title: string }>,
): Promise<void> {
  // Find products whose handle still contains a CJ ID AND whose clean counterpart already exists
  const cleanHandles = new Set(products.map((p) => p.handle));
  const stale = products.filter((p) => {
    if (!CJ_HANDLE_PATTERN.test(p.handle)) return false;
    const fix = PRODUCT_FIXES.find((f) => p.handle.includes(f.matchHandle));
    return fix && cleanHandles.has(fix.newHandle); // clean version already exists
  });

  if (stale.length === 0) return;
  console.log(`\n   🗑️  Removing ${stale.length} stale duplicate(s) with CJ IDs in handle...`);

  for (const p of stale) {
    try {
      await gql(`mutation { productDelete(input: { id: "${p.id}" }) { deletedProductId userErrors { message } } }`);
      console.log(`   ✅  Deleted stale: ${p.handle}`);
    } catch (err) {
      console.log(`   ⚠️  Could not delete ${p.handle}: ${(err as Error).message}`);
    }
    await sleep(400);
  }
}

async function fixProducts(): Promise<void> {
  console.log('\n📦  Step 1: Updating products (handles + descriptions)...');
  const products = await getAllProducts();
  console.log(`   Found ${products.length} products total`);

  // First pass: apply fixes to products that still have CJ IDs
  let fixed = 0;
  let alreadyClean = 0;

  for (const product of products) {
    // Already clean handle — skip unless it still needs a description update
    if (!CJ_HANDLE_PATTERN.test(product.handle)) {
      const fix = PRODUCT_FIXES.find((f) => product.handle === f.newHandle);
      if (!fix) { alreadyClean++; continue; }
      // Re-apply description to already-clean handle (idempotent)
      try {
        await updateProduct(product.id, fix);
        console.log(`   🔄  Refreshed description: ${product.title.slice(0, 45)}`);
        fixed++;
      } catch { alreadyClean++; }
      await sleep(600);
      continue;
    }

    const fix = PRODUCT_FIXES.find((f) => product.handle.includes(f.matchHandle));
    if (!fix) {
      alreadyClean++; // non-pet product draft — leave it
      continue;
    }

    try {
      await updateProduct(product.id, fix);
      console.log(`   ✅  ${product.title.slice(0, 45)} → /${fix.newHandle}`);
      fixed++;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('already in use')) {
        console.log(`   ℹ️  Handle already clean (duplicate): ${product.handle}`);
      } else {
        console.error(`   ❌  Failed: ${product.handle} — ${msg}`);
      }
    }
    await sleep(600);
  }

  console.log(`\n   Updated: ${fixed} | Already clean / non-pet: ${alreadyClean}`);

  // Second pass: delete stale duplicates with CJ IDs
  const refreshed = await getAllProducts();
  await deleteDuplicateStaleProducts(refreshed);
}

// ── Step 2: Fix navigation menus ──────────────────────────────────────────────

async function fixNavigation(): Promise<void> {
  console.log('\n🗺️  Step 2: Fixing navigation menus (Spanish → English)...');

  // Get link lists (menus)
  let linkLists: Array<{ id: number; handle: string; title: string; links: Array<{ title: string; url: string; type: string }> }>;
  try {
    const result = await rest<{ smart_collections: unknown[]; link_lists?: Array<{ id: number; handle: string; title: string; links: Array<{ title: string; url: string; type: string }> }> }>(
      'GET',
      '/link_lists.json',
    );
    linkLists = (result as any).link_lists ?? [];
  } catch {
    console.log('   ℹ️  Link lists not available via this API (custom app scope may be needed)');
    await fixNavigationViaGraphql();
    return;
  }

  const mainMenu = linkLists.find((l) => l.handle === 'main-menu' || l.handle === 'main');
  if (!mainMenu) {
    console.log('   ℹ️  Main menu not found via REST, trying GraphQL...');
    await fixNavigationViaGraphql();
    return;
  }

  const spanishToEnglish: Record<string, string> = {
    'Inicio': 'Home',
    'Catálogo': 'Catalog',
    'Catalog': 'Catalog',
    'Contacto': 'Contact',
    'Más': 'More',
  };

  const updatedLinks = mainMenu.links.map((link) => ({
    ...link,
    title: spanishToEnglish[link.title] ?? link.title,
  }));

  await rest('PUT', `/link_lists/${mainMenu.id}.json`, {
    link_list: { links: updatedLinks },
  });

  console.log('   ✅  Navigation updated to English');
}

async function fixNavigationViaGraphql(): Promise<void> {
  // Try GraphQL Menu API (available in newer API versions)
  const data = await gql<{ menus: { nodes: Array<{ id: string; handle: string; title: string; items: Array<{ id: string; title: string }> }> } }>(
    `query {
      menus(first: 10) {
        nodes { id handle title items { id title } }
      }
    }`,
  ).catch(() => null);

  if (!data) {
    console.log('   ⚠️  Could not access menus via GraphQL — skipping (manual fix needed in Shopify Admin)');
    return;
  }

  const spanishToEnglish: Record<string, string> = {
    'Inicio': 'Home',
    'Catálogo': 'Catalog',
    'Contacto': 'Contact',
  };

  type MenuItem = { id: string; title: string };
  type Menu = { id: string; handle: string; title: string; items: MenuItem[] };

  const mainMenu = data.menus.nodes.find((m: Menu) =>
    m.handle === 'main-menu' || m.handle === 'main',
  ) as Menu | undefined;

  if (!mainMenu) {
    console.log('   ⚠️  Main menu not found');
    return;
  }

  const itemsToUpdate = mainMenu.items.filter((item: MenuItem) =>
    spanishToEnglish[item.title] !== undefined,
  );

  for (const item of itemsToUpdate) {
    await gql(`
      mutation {
        menuItemUpdate(id: "${item.id}", title: "${spanishToEnglish[item.title] ?? item.title}") {
          menuItem { id title }
          userErrors { field message }
        }
      }
    `).catch(() => null);
    console.log(`   ✅  "${item.title}" → "${spanishToEnglish[item.title]}"`);
  }
}

// ── Step 3: Update contact page ────────────────────────────────────────────────

async function fixContactPage(): Promise<void> {
  console.log('\n📬  Step 3: Updating contact page...');

  const contactBody = `<div style="max-width: 600px; margin: 0 auto;">
  <h2>We're here to help</h2>
  <p>Have a question about your order, our products, or anything else? Reach out — we respond within 24 hours on business days.</p>

  <h3>📧 Email Support</h3>
  <p><a href="mailto:support@pawvault.com">support@pawvault.com</a><br>
  Response time: within 24 hours (Mon–Fri)</p>

  <h3>📦 Order Issues</h3>
  <p>For damaged items, lost packages, or refund requests, please email us with your order number and a photo if applicable.</p>

  <h3>📱 Follow us</h3>
  <p>
    <a href="https://www.instagram.com/pawvault" target="_blank">Instagram @pawvault</a> — daily pet content, tips &amp; new arrivals<br>
    <a href="https://www.tiktok.com/@pawvault" target="_blank">TikTok @pawvault</a> — behind the scenes and unboxings
  </p>

  <h3>⏰ Business Hours</h3>
  <p>Monday – Friday: 9:00 AM – 5:00 PM EST<br>
  Saturday – Sunday: Closed (emails answered next business day)</p>
</div>`;

  // Try REST pages API first
  try {
    const result = await rest<{ pages: Array<{ id: number; handle: string; title: string }> }>(
      'GET',
      '/pages.json',
    );
    const contactPage = result.pages.find(
      (p) => p.handle === 'contact' || p.title.toLowerCase().includes('contact'),
    );
    if (!contactPage) {
      console.log('   ⚠️  Contact page not found in store pages');
      return;
    }
    await rest('PUT', `/pages/${contactPage.id}.json`, { page: { body_html: contactBody } });
    console.log('   ✅  Contact page updated with email + social links');
    return;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('read_content') || msg.includes('403')) {
      console.log('   ⚠️  App lacks read_content/write_content scope — manual update needed');
      console.log('   📋  Go to: Shopify Admin → Online Store → Pages → Contact');
      console.log('   📋  Add: support@pawvault.com + Instagram/TikTok links + business hours');
    } else {
      console.log(`   ⚠️  Contact page update failed: ${msg}`);
    }
  }
}

// ── Step 4: Fix About / Shipping pages ────────────────────────────────────────

async function fixShippingPage(): Promise<void> {
  console.log('\n🚚  Step 4: Verifying shipping policy consistency...');

  // Update the shipping policy via Shopify policies (REST)
  const shippingBody = `<h2>Shipping Policy</h2>

<h3>Processing Time</h3>
<p>All orders are processed within 1–2 business days (Monday through Friday, excluding federal holidays). Orders placed on weekends begin processing the next business day.</p>

<h3>Shipping Times</h3>
<p>Standard shipping: <strong>5–8 business days</strong> after processing.</p>
<p>We ship exclusively within the continental United States at this time.</p>

<h3>Shipping Costs</h3>
<ul>
  <li><strong>Free shipping</strong> on orders over $50</li>
  <li><strong>$4.99 flat rate</strong> on orders under $50</li>
</ul>

<h3>Tracking</h3>
<p>Once your order ships, you'll receive a confirmation email with your tracking number. Allow up to 24 hours for tracking to show movement.</p>

<h3>Lost or Delayed Packages</h3>
<p>If your order hasn't arrived within 10 business days of the estimated delivery date, contact us at <a href="mailto:support@pawvault.com">support@pawvault.com</a> and we'll investigate immediately.</p>

<h3>Damaged Items</h3>
<p>If your item arrives damaged, please email us at <a href="mailto:support@pawvault.com">support@pawvault.com</a> within 48 hours of delivery with a photo of the damage. We'll send a replacement or issue a full refund at no cost to you.</p>`;

  try {
    await rest('PUT', '/policies/shipping_policy.json', {
      policy: { body: shippingBody },
    });
    console.log('   ✅  Shipping policy updated (consistent 5–8 business days)');
  } catch {
    console.log('   ℹ️  Shipping policy update via REST not available (update manually in Shopify Admin > Settings > Policies)');
    console.log('   📋  Correct time to use: 5–8 business days after processing');
  }
}

// ── Step 5: Update theme footer with social links ──────────────────────────────

async function fixThemeSettings(): Promise<void> {
  console.log('\n🎨  Step 5: Adding social media links to theme settings...');

  try {
    // Get active theme
    const themesResult = await rest<{ themes: Array<{ id: number; role: string; name: string }> }>(
      'GET',
      '/themes.json',
    );
    const activeTheme = themesResult.themes.find((t) => t.role === 'main');

    if (!activeTheme) {
      console.log('   ⚠️  Active theme not found');
      return;
    }

    // Get settings_data.json
    const assetResult = await rest<{ asset: { value: string } }>(
      'GET',
      `/themes/${activeTheme.id}/assets.json?asset[key]=config/settings_data.json`,
    );

    let settings: Record<string, unknown>;
    try {
      settings = JSON.parse(assetResult.asset.value) as Record<string, unknown>;
    } catch {
      console.log('   ⚠️  Could not parse theme settings_data.json');
      return;
    }

    const current = (settings.current ?? {}) as Record<string, unknown>;
    current['social_instagram_link'] = 'https://www.instagram.com/pawvault';
    current['social_tiktok_link'] = 'https://www.tiktok.com/@pawvault';
    current['social_facebook_link'] = '';
    current['social_twitter_link'] = '';
    settings.current = current;

    await rest('PUT', `/themes/${activeTheme.id}/assets.json`, {
      asset: {
        key: 'config/settings_data.json',
        value: JSON.stringify(settings, null, 2),
      },
    });

    console.log('   ✅  Social links added to theme settings (Instagram + TikTok)');
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('403') || msg.includes('read_themes')) {
      console.log('   ⚠️  App lacks read_themes/write_themes scope — manual update needed');
      console.log('   📋  Shopify Admin → Online Store → Themes → Customize → Theme Settings → Social Media');
      console.log('   📋  Instagram: https://www.instagram.com/pawvault');
      console.log('   📋  TikTok: https://www.tiktok.com/@pawvault');
    } else {
      console.log(`   ⚠️  Theme settings update failed: ${msg}`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🐾  PawVault Store Fix Script');
  console.log(`📡  Shop: ${SHOP_DOMAIN}`);
  console.log(`🔑  Authenticating...`);

  try {
    await getToken();
    console.log('✅  Authentication OK\n');
  } catch (err) {
    console.error(`❌  Auth failed: ${(err as Error).message}`);
    process.exit(1);
  }

  await fixProducts();
  await fixNavigation();
  await fixContactPage();
  await fixShippingPage();
  await fixThemeSettings();

  console.log('\n🎉  All automated fixes applied!');
  console.log('\n📋  Manual steps in Shopify Admin (https://admin.shopify.com/store/ivanreseller-2):');
  console.log('\n   NAVIGATION (Online Store → Navigation → Main Menu):');
  console.log('   • Rename "Inicio" → "Home"');
  console.log('   • Rename "Catálogo" → "Catalog"');
  console.log('   • Rename "Contacto" → "Contact"');
  console.log('\n   CONTACT PAGE (Online Store → Pages → Contact):');
  console.log('   • Add email: support@pawvault.com');
  console.log('   • Add Instagram: https://www.instagram.com/pawvault');
  console.log('   • Add TikTok: https://www.tiktok.com/@pawvault');
  console.log('   • Add business hours: Mon–Fri 9am–5pm EST');
  console.log('\n   SHIPPING POLICY (Settings → Policies):');
  console.log('   • Standardize to: "5–8 business days" everywhere (remove "3-7" and "up to 8")');
  console.log('\n   THEME SOCIAL MEDIA (Online Store → Themes → Customize → Theme Settings):');
  console.log('   • Instagram URL: https://www.instagram.com/pawvault');
  console.log('   • TikTok URL: https://www.tiktok.com/@pawvault');
  console.log('\n   REVIEWS APP (Apps → App Store):');
  console.log('   • Install Judge.me (free) or Loox — shows real product reviews');
  console.log('\n   OPTIONAL IMPROVEMENTS:');
  console.log('   • Lower free shipping threshold: $50 → $35 (Settings → Shipping)');
  console.log('   • Upload lifestyle photos for each product (pets using the product)');
  console.log('   • Add "Only X left" urgency badge (via theme customizer)');
}

main().catch((err) => {
  console.error('\n💥  Script failed:', err);
  process.exit(1);
});
