-- Deeper stock board: 28 more tickers across the three tiers. Figures are
-- approximate 10-year averages and worst peak-to-trough drops, disclosed as
-- such in-app. Never ranked by return; the UI sorts alphabetically.

insert into stock_lines (ticker, name, tier, avg_return_10y, max_drawdown) values
-- tier 0: broad funds
('VIG','Dividend growth fund',0,11,-32),
('VT','Total world fund',0,9,-34),
('AGG','Core bond fund',0,1.5,-17),
('GLD','Gold fund',0,9,-22),
('IJR','Small-cap 600 fund',0,8,-44),
-- tier 1: household blue chips
('WMT','Walmart',1,16,-27),
('HD','Home Depot',1,15,-38),
('PG','Procter & Gamble',1,11,-25),
('PEP','PepsiCo',1,7,-33),
('MCD','McDonald''s',1,13,-27),
('V','Visa',1,17,-34),
('MA','Mastercard',1,19,-33),
('UNH','UnitedHealth',1,10,-70),
('XOM','Exxon Mobil',1,9,-55),
('CAT','Caterpillar',1,18,-47),
('SBUX','Starbucks',1,8,-45),
('NKE','Nike',1,4,-62),
('ABBV','AbbVie',1,14,-45),
-- tier 2: single names that swing
('AVGO','Broadcom',2,38,-41),
('ORCL','Oracle',2,22,-41),
('CRM','Salesforce',2,18,-58),
('ADBE','Adobe',2,15,-60),
('INTC','Intel',2,2,-65),
('UBER','Uber',2,24,-47),
('SHOP','Shopify',2,28,-85),
('PLTR','Palantir',2,55,-85),
('BA','Boeing',2,2,-75),
('HOOD','Robinhood',2,35,-78)
on conflict (ticker) do nothing;
