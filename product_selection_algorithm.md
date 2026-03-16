# Product Selection Algorithm

## Objective
Automatically identify products with high probability of selling.

## Supplier Filters

orders >= 300
rating >= 4.5
reviews >= 50

## Market Validation

Search keyword in marketplace.

Collect:

listing_count
average_price
estimated_sales

Compute:

sales_competition_ratio = estimated_sales / listing_count

Publish only if:

ratio >= 0.3

## Supplier Reliability

supplier_rating >= 90%

## Shipping Validation

shipping_time <= 15 days

## Product Exclusions

Exclude:
fragile items
trademarked brands
restricted items
high return rate categories

## Ranking Score

score =
(demand_weight * demand_score)
+ (competition_weight * competition_score)
+ (supplier_weight * supplier_score)

Publish only if score >= threshold