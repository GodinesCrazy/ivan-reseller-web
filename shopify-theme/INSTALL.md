# IVAN RESELLER - Shopify Theme Installation Guide

## Quick Start (5 Minutes)

### Step 1: Access Shopify Theme Editor
1. Go to `https://ivanreseller-2.myshopify.com/admin`
2. Navigate to **Online Store** → **Themes**
3. Click **Customize** on your current theme (Dawn or active theme)

### Step 2: Add Custom CSS (Critical - Do First)

**Method A: Via Theme Editor (Easiest)**
1. In the theme editor, click **Theme settings** (bottom left)
2. Select **Custom CSS**
3. Open file: `shopify-theme/assets/ivan-reseller-custom.css`
4. Copy ALL the CSS content
5. Paste into the Custom CSS box
6. Click **Save**

**Method B: Via Code Editor (More Control)**
1. From Themes page, click **...** → **Edit code**
2. Go to **Assets** folder
3. Click **Add a new asset** → **Create a blank file**
4. Name: `ivan-reseller-custom.css`
5. Paste the CSS content from the file
6. In `layout/theme.liquid`, add before `</head>`:
   ```liquid
   {{ 'ivan-reseller-custom.css' | asset_url | stylesheet_tag }}
   ```

### Step 3: Add Custom Sections

For each section file in `shopify-theme/sections/`:

1. In Edit Code view, go to **Sections** folder
2. Click **Add a new section**
3. Name: `ir-trust-bar` (or matching filename)
4. Replace the default code with the content from the file
5. Click **Save**

Repeat for:
- `ir-hero.liquid`
- `ir-why-us.liquid`
- `ir-product-trust.liquid`

### Step 4: Add JavaScript

1. In **Assets**, click **Add a new asset** → **Create a blank file**
2. Name: `ivan-reseller.js`
3. Paste content from the file
4. In `layout/theme.liquid`, add before `</body>`:
   ```liquid
   <script src="{{ 'ivan-reseller.js' | asset_url }}" defer></script>
   ```

---

## Critical Language Fix (Do This Immediately)

### Fix Spanish → English

1. Go to **Settings** → **Languages**
2. Click **Change theme language** → Select **English**
3. Click **...** → **Edit default theme content**
4. Search and replace:
   - `Agregar al carrito` → `Add to Cart`
   - `Pagar con PayPal` → `Pay with PayPal`
   - `Más opciones de pago` → `More payment options`
   - `Cantidad` → `Quantity`

---

## Homepage Setup

### Add Announcement Bar
1. In theme editor, click **Add section**
2. Select **Announcement bar**
3. Set background: `#0F172A` (navy)
4. Text: `🚚 Free Shipping on Orders Over $35 | AI-Curated Products`
5. Text color: White

### Add Hero Section (IR - Hero)
1. Click **Add section** → **IR - Hero**
2. Upload a hero image (1200x800px recommended)
3. Configure:
   - Eyebrow: `AI-CURATED FOR YOU`
   - Title: `Trending Products, Smarter Shopping`
   - Subtitle: `Discover quality products sourced by AI, delivered fast to your door.`
   - Button 1: `Shop Best Sellers` → Link to `/collections/all`
   - Button 2: `See What's New` → Link to `/collections/new-arrivals`

### Add Trust Bar (IR - Trust Bar)
1. Add section **IR - Trust Bar**
2. Default blocks are pre-configured:
   - 🚚 Free Shipping / Over $35
   - ⚡ Fast Delivery / 3-7 Days USA
   - 🔄 Easy Returns / 30-Day Policy
   - 🤖 AI Curated / Trending Products

### Add Why Shop With Us (IR - Why Shop With Us)
1. Add section **IR - Why Shop With Us**
2. Pre-configured with 3 value cards

### Add Featured Collection
1. Add section **Featured collection**
2. Select collection: `All` or create `Best Sellers`
3. Show 4-8 products
4. Enable "View all" button

---

## Product Page Setup

### Add Trust Elements to Product Page
1. In product page editor, click **Add section**
2. Select **IR - Product Trust Elements**
3. Configure:
   - Enable: Guarantee badge, Benefits, Stock indicator, Trust bar, Payment icons
   - Add 3 benefit blocks with your product's key features

### Product Page Template Structure (Recommended Order)
1. Announcement bar
2. Header
3. Main product section
4. **IR - Product Trust Elements** (add this)
5. Image with text (product benefits)
6. Collapsible tabs (FAQ, Shipping, Returns)
7. Related products

### Enable Sticky Add to Cart (Mobile)
The JavaScript automatically adds this. Just ensure the JS file is loaded.

---

## Theme Settings Configuration

### Colors
Navigate to **Theme settings** → **Colors**:

| Setting | Color |
|---------|-------|
| Primary background | `#FAFBFC` |
| Secondary background | `#F1F5F9` |
| Text | `#1E293B` |
| Solid button background | `#0F172A` |
| Solid button text | `#FFFFFF` |
| Outline button | `#0F172A` |
| Link | `#14B8A6` |
| Sale badge | `#F97316` |

### Typography
**Theme settings** → **Typography**:
- Heading font: Inter (or system font)
- Body font: Inter
- Scale: Medium or Large

### Product Media
**Theme settings** → **Product media**:
- Enable image zoom: ✓
- Desktop layout: Thumbnail carousel
- Media fit: Contain

---

## Page-Specific Content

### Shipping Page
Create a page with URL `/pages/shipping`:

```
# Shipping Information

## Standard Shipping (FREE over $35)
- Delivery time: 3-7 business days
- Tracking: Yes, email sent when shipped
- Origin: USA-based facilities

## Express Shipping
- Cost: $5.99 flat rate
- Delivery time: 2-3 business days
- Available for all US addresses

## Order Processing
- Orders placed before 2PM EST ship same day
- Orders placed after 2PM EST ship next business day
- No weekend or holiday shipping

## Tracking
Track your order anytime at [tracking link] or contact us.
```

### Returns Page
Create a page with URL `/pages/returns`:

```
# Returns & Refunds

## 30-Day Money Back Guarantee
Not happy with your purchase? We make returns easy.

### How to Return:
1. Contact us within 30 days of delivery
2. We'll email you a prepaid return label
3. Ship the item back in original condition
4. Refund processed within 5 business days of receipt

### Conditions:
- Item must be unused and in original packaging
- Include all accessories and materials
- Original shipping charges not refunded (unless defective)

### Refund Method:
Refunds issued to original payment method.

Questions? Contact us at [email].
```

---

## Color Swatches for Variants

To enable color swatches on product page:

1. In product admin, ensure variants are named with color names:
   - Teal
   - Pink  
   - Black
   - Gray

2. The CSS automatically styles swatches when variant names match common color names.

3. For custom colors, add to CSS:
   ```css
   .ir-color-swatch[data-color="custom"] {
     background: #HEXCODE;
   }
   ```

---

## Testing Checklist

Before launching:

- [ ] Language is English (no Spanish text)
- [ ] Navy + teal color scheme applied
- [ ] Hero section displays correctly
- [ ] Trust bar shows 4 items
- [ ] Product page has trust elements below add to cart
- [ ] Mobile sticky cart appears when scrolling
- [ ] Payment icons visible (Visa, MC, Amex, PayPal)
- [ ] Stock indicator shows "Only X left"
- [ ] FAQ accordion opens/closes
- [ ] Footer has all links
- [ ] Product images zoom on hover (desktop)
- [ ] Thumbnail gallery works

---

## Troubleshooting

### CSS not applying?
- Check if custom CSS is in the right place (Theme settings → Custom CSS)
- Clear browser cache (Ctrl+Shift+R)
- Check for CSS syntax errors

### Sections not appearing?
- Verify section files are in the Sections folder
- Check for Liquid syntax errors
- Ensure theme is OS 2.0 compatible

### Language still showing Spanish?
- Go to Settings → Languages
- Check if theme content is translated
- Clear cache and hard refresh

### Images not loading?
- Check image URLs in section settings
- Ensure images are uploaded to Shopify
- Check for HTTPS vs HTTP issues

---

## Next Steps After Installation

1. **Upload product images** at 800x800px minimum
2. **Write compelling product descriptions** with benefits
3. **Set up shipping rates** (free over $35)
4. **Create legal pages** (Privacy, Terms)
5. **Configure payment methods** (PayPal, Shop Pay)
6. **Add Google Analytics** for tracking
7. **Test checkout flow** end-to-end

---

## Support

For issues with this theme customization:
1. Check browser console for JavaScript errors
2. Verify all files were uploaded correctly
3. Confirm theme is OS 2.0 compatible
4. Test with all apps disabled

---

**Installation complete!** Your store should now have the Ivan Reseller premium look and feel.
