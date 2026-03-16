# Marketplace Listing & Optimization Agent Specification
Version: 1.0
Purpose: Automated dropshipping listing optimization system
Target marketplaces: Mercado Libre, eBay, Amazon
Primary supplier: AliExpress

## Objective
Define the architecture and operational rules for the automated SaaS agent responsible for publishing and optimizing product listings while complying with marketplace policies and maximizing probability of sales.

## Key Responsibilities
- Discover products
- Filter products
- Analyze demand
- Generate SEO listings
- Optimize images
- Set competitive pricing
- Publish listings
- Monitor performance
- Optimize listings continuously
- Detect winning products
- Ensure policy compliance

## Supported Marketplaces
- Mercado Libre Chile
- eBay USA
- Amazon USA

Future expansion planned:
- Mercado Libre LATAM
- Amazon EU
- Walmart Marketplace

## Core Modules
product_discovery_engine
market_demand_analyzer
supplier_data_parser
seo_title_generator
image_optimizer
pricing_engine
listing_publisher
listing_optimizer
performance_tracker
winner_detector
policy_compliance_engine

## Product Discovery

Supplier data collected from AliExpress:

product_id
title
images
price
shipping_options
orders_count
rating
reviews_count
variants
supplier_id

## Product Filtering Rules

orders >= 300
rating >= 4.5
reviews >= 50
supplier_score >= 90%
shipping_time <= 15 days

Products failing filters must be discarded.

## Demand Analysis

Data collected from marketplaces:

number_of_listings
average_price
estimated_monthly_sales
top_seller_sales

sales_competition_ratio =
estimated_monthly_sales / number_of_listings

Reject if ratio < 0.3

## SEO Title Generation

Mercado Libre structure:
product + brand + model + key_feature + compatibility

eBay structure:
keyword + feature + model + compatibility + use

Amazon structure:
brand + product_type + feature + model + compatibility

## Image Optimization

remove_watermarks
increase_resolution
normalize_background
generate_additional_images

Required set:
1 product white background
2 product in use
3 close up features
4 packaging contents
5 feature diagram

Minimum resolution 1200x1200

## Pricing Engine

competitor_prices = top 5 prices

target_price = min(competitor_prices) * 0.97

Margin constraints:
minimum_margin 20%
maximum_margin 35%

## Shipping Optimization

Allowed shipping methods:
AliExpress Standard Shipping
Cainiao Standard
ePacket

Max shipping time: 15 days

## Performance Metrics

impressions
clicks
CTR
add_to_cart
sales
conversion_rate
revenue

Targets:
CTR >= 2%
conversion_rate >= 3%

## Optimization Loop

Every 48 hours evaluate:

if impressions > 200 and sales == 0

actions:
reduce price
modify title
replace main image

## Winner Detection

sales_last_3_days >= 5

Actions:
mark winner
republish across marketplaces
duplicate listings

## Stock Synchronization

Check supplier stock every 6 hours.

If stock = 0:
pause listing

## Compliance

Amazon:
seller must be merchant of record
no supplier branding

eBay:
seller responsible for delivery and customer satisfaction

Mercado Libre:
accurate description required

## Continuous Loop

product discovery
product filtering
market analysis
listing creation
performance tracking
optimization
winner detection
scaling