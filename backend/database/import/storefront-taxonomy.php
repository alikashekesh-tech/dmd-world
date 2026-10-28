<?php

/*
| How the old store's WooCommerce categories are laid out on the DMD World storefront. Generated once from the
| storefront's curated menu (src/data/dmdMenu.js, 2026-10-06) and used only by `php artisan dmd:import`.
| After the import, MySQL is the source of truth: this file is migration history, not live data.
|
| 'ids' are WooCommerce category ids: the first becomes the category (same id); any others become its children.
| A node without ids is a storefront grouping that has no WooCommerce category (it gets a new id).
| Brands were top-level WooCommerce categories; they become brands (same id) and their sub-categories become
| that brand's product lines.
*/

return [
    'categories' => [
        [
            'ids' => [393],
            'name' => 'PC Parts',
            'slug' => 'pc-parts',
            'description' => 'Chairs, tables, monitors and storage',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/computer-parts-icons-black-vector.jpg',
            'icon' => 'monitor',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [413],
                    'name' => 'Chair and Table',
                    'slug' => 'chair-and-table',
                ],
                [
                    'ids' => [412],
                    'name' => 'Monitors',
                    'slug' => 'monitors',
                ],
                [
                    'ids' => [924],
                    'name' => 'Hard Disk and Flash',
                    'slug' => 'hard-disk-and-flash',
                    'children' => [
                        [
                            'ids' => [961],
                            'name' => 'Hard Disk',
                            'slug' => 'hard-disk',
                        ],
                        [
                            'ids' => [],
                            'name' => 'Flash Memory',
                            'slug' => 'flash-memory',
                        ],
                    ],
                ],
            ],
        ],
        [
            'ids' => [295],
            'name' => 'PlayStation',
            'slug' => 'playstation',
            'description' => 'Consoles, new and used games, accessories and PS cards',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/01/sony-ps5-console-new-playstation-5-console-slim-jp-edition-2023-2-x-dualsense-wireless-controllers-34142729961604_1200x1200.webp',
            'icon' => 'console-ps5',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [300],
                    'name' => 'PS5',
                    'slug' => 'ps5',
                    'children' => [
                        [
                            'ids' => [338],
                            'name' => 'Games',
                            'slug' => 'games',
                            'children' => [
                                [
                                    'ids' => [293],
                                    'name' => 'New',
                                    'slug' => 'new',
                                ],
                                [
                                    'ids' => [339],
                                    'name' => 'Used',
                                    'slug' => 'used',
                                ],
                            ],
                        ],
                        [
                            'ids' => [294],
                            'name' => 'Accessories',
                            'slug' => 'accessories',
                        ],
                        [
                            'ids' => [304],
                            'name' => 'Consoles',
                            'slug' => 'consoles',
                        ],
                        [
                            'ids' => [],
                            'name' => 'Repair Parts',
                            'slug' => 'repair-parts',
                        ],
                    ],
                ],
                [
                    'ids' => [299],
                    'name' => 'PS4',
                    'slug' => 'ps4',
                    'children' => [
                        [
                            'ids' => [336],
                            'name' => 'Games',
                            'slug' => 'games',
                            'children' => [
                                [
                                    'ids' => [291],
                                    'name' => 'New',
                                    'slug' => 'new',
                                ],
                                [
                                    'ids' => [337],
                                    'name' => 'Used',
                                    'slug' => 'used',
                                ],
                            ],
                        ],
                        [
                            'ids' => [292],
                            'name' => 'Accessories',
                            'slug' => 'accessories',
                        ],
                        [
                            'ids' => [334],
                            'name' => 'Consoles',
                            'slug' => 'consoles',
                        ],
                    ],
                ],
                [
                    'ids' => [290],
                    'name' => 'PS3',
                    'slug' => 'ps3',
                ],
                [
                    'ids' => [289],
                    'name' => 'PS2',
                    'slug' => 'ps2',
                ],
                [
                    'ids' => [352],
                    'name' => 'PS Cards',
                    'slug' => 'ps-cards',
                ],
            ],
        ],
        [
            'ids' => [296],
            'name' => 'Nintendo Switch',
            'slug' => 'nintendo-switch',
            'description' => 'New and used games, consoles, accessories',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/01/Nintendo-Switch-Gaming-Console-with-Neon-Blue-and-Neon-Red-Joy-Con_69c973cc-1051-4940-b367-c717ebff38af.d1e17f8ce95a56079d3440e8a267898b.webp',
            'icon' => 'console-switch',
            'accent_color' => '#e60012',
            'children' => [
                [
                    'ids' => [340],
                    'name' => 'Games',
                    'slug' => 'games',
                    'children' => [
                        [
                            'ids' => [297],
                            'name' => 'New',
                            'slug' => 'new',
                        ],
                        [
                            'ids' => [341],
                            'name' => 'Used',
                            'slug' => 'used',
                        ],
                    ],
                ],
                [
                    'ids' => [342],
                    'name' => 'Consoles',
                    'slug' => 'consoles',
                ],
                [
                    'ids' => [298],
                    'name' => 'Accessories',
                    'slug' => 'accessories',
                ],
            ],
        ],
        [
            'ids' => [286],
            'name' => 'Xbox',
            'slug' => 'xbox',
            'description' => 'Xbox 360, One and Series',
            'icon' => 'console-xbox',
            'accent_color' => '#2e9a63',
            'children' => [
                [
                    'ids' => [305],
                    'name' => 'Xbox 360',
                    'slug' => 'xbox-360',
                ],
                [
                    'ids' => [306],
                    'name' => 'Xbox One',
                    'slug' => 'xbox-one',
                ],
                [
                    'ids' => [307, 404],
                    'name' => 'Xbox Series',
                    'slug' => 'xbox-series',
                ],
            ],
        ],
        [
            'ids' => [433],
            'name' => 'Tablets',
            'slug' => 'tablets',
            'description' => 'Tablets for work, play and kids',
            'icon' => 'laptop',
            'accent_color' => '#1f6feb',
        ],
        [
            'ids' => [415],
            'name' => 'Laptops',
            'slug' => 'laptops',
            'description' => 'Laptops, bags and coolers',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/01/Microsoft-Surface-Laptop-4-15-Touch-Screen-Intel-Core-i7-16GB-512GB-Solid-State-Drive-Latest-Model-Platinum_9b3000c9-30ff-423c-9b64-97bbbf9c894a.4c8c707ebf8fa9989ae27863682bf815-scaled.webp',
            'icon' => 'laptop',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [416],
                    'name' => 'Laptop Bags',
                    'slug' => 'laptop-bags',
                ],
                [
                    'ids' => [418],
                    'name' => 'Laptop Coolers',
                    'slug' => 'laptop-coolers',
                ],
                [
                    'ids' => [423],
                    'name' => 'Laptops',
                    'slug' => 'laptops',
                ],
            ],
        ],
        [
            'ids' => [],
            'name' => 'Other',
            'slug' => 'other',
            'description' => 'Gadgets, toys, phone, computer and network accessories',
            'icon' => 'light',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [323],
                    'name' => 'Retro Games & Consoles',
                    'slug' => 'retro-games-and-consoles',
                ],
                [
                    'ids' => [282],
                    'name' => 'Gadgets',
                    'slug' => 'gadgets',
                ],
                [
                    'ids' => [363],
                    'name' => 'Electronic Toys',
                    'slug' => 'electronic-toys',
                ],
                [
                    'ids' => [369],
                    'name' => 'Action Figures',
                    'slug' => 'action-figures',
                ],
                [
                    'ids' => [287],
                    'name' => 'Phone Accessories',
                    'slug' => 'phone-accessories',
                ],
                [
                    'ids' => [321],
                    'name' => 'AirPods',
                    'slug' => 'airpods',
                ],
                [
                    'ids' => [285],
                    'name' => 'Speakers',
                    'slug' => 'speakers',
                ],
                [
                    'ids' => [281],
                    'name' => 'Computer Accessories',
                    'slug' => 'computer-accessories',
                ],
                [
                    'ids' => [349],
                    'name' => 'Network Products',
                    'slug' => 'network-products',
                ],
                [
                    'ids' => [322],
                    'name' => 'Smart Watches',
                    'slug' => 'smart-watches',
                ],
            ],
        ],
        [
            'ids' => [996],
            'name' => 'New Offers',
            'slug' => 'new-offers',
            'description' => 'The latest discounts across the store',
            'icon' => 'light',
            'accent_color' => '#ff5d4d',
        ],
    ],
    'brands' => [
        [
            'ids' => [547],
            'name' => 'Marvo',
            'slug' => 'marvo',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/01/de84c498-aedb-4158-bae5-9196172cb369.jpg',
            'icon' => 'keyboard',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [597],
                    'name' => 'Chairs and Tables',
                    'slug' => 'chairs-and-tables',
                ],
                [
                    'ids' => [600],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [549],
                    'name' => 'Keyboards',
                    'slug' => 'keyboards',
                ],
                [
                    'ids' => [548],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
                [
                    'ids' => [595],
                    'name' => 'Mouse Pads',
                    'slug' => 'mouse-pads',
                ],
                [
                    'ids' => [596],
                    'name' => 'Speakers and Microphones',
                    'slug' => 'speakers-and-microphones',
                ],
            ],
        ],
        [
            'ids' => [860],
            'name' => 'Onikuma',
            'slug' => 'onikuma',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/Onikuma_logo.webp',
            'icon' => 'headset',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [862],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [917],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
            ],
        ],
        [
            'ids' => [911],
            'name' => 'HyperX',
            'slug' => 'hyperx',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/hyperx-logo-png_seeklogo-425410.png',
            'icon' => 'headset',
            'accent_color' => '#ff5d4d',
            'children' => [
                [
                    'ids' => [420],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [436],
                    'name' => 'Keyboards',
                    'slug' => 'keyboards',
                ],
                [
                    'ids' => [912],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
                [
                    'ids' => [913],
                    'name' => 'Mouse Pads',
                    'slug' => 'mouse-pads',
                ],
            ],
        ],
        [
            'ids' => [1000],
            'name' => 'Logitech',
            'slug' => 'logitech',
            'icon' => 'mouse',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [1004],
                    'name' => 'Headsets',
                    'slug' => 'headsets',
                ],
                [
                    'ids' => [1002],
                    'name' => 'Keyboards',
                    'slug' => 'keyboards',
                ],
                [
                    'ids' => [1001],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
                [
                    'ids' => [1003],
                    'name' => 'Webcams',
                    'slug' => 'webcams',
                ],
            ],
        ],
        [
            'ids' => [850],
            'name' => 'Moxom',
            'slug' => 'moxom',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/5ceddc82d2.webp',
            'icon' => 'dongle',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [856],
                    'name' => 'Accessories',
                    'slug' => 'accessories',
                ],
                [
                    'ids' => [857],
                    'name' => 'Cables and Adapters',
                    'slug' => 'cables-and-adapters',
                ],
                [
                    'ids' => [854],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [853],
                    'name' => 'Power Banks',
                    'slug' => 'power-banks',
                ],
                [
                    'ids' => [855],
                    'name' => 'Razor Shave',
                    'slug' => 'razor-shave',
                ],
                [
                    'ids' => [858],
                    'name' => 'Sockets',
                    'slug' => 'sockets',
                ],
                [
                    'ids' => [852],
                    'name' => 'Speakers',
                    'slug' => 'speakers',
                ],
            ],
        ],
        [
            'ids' => [774],
            'name' => 'Megavolt',
            'slug' => 'megavolt',
            'icon' => 'dongle',
            'accent_color' => '#f5b84a',
            'children' => [
                [
                    'ids' => [987],
                    'name' => 'Chairs',
                    'slug' => 'chairs',
                ],
                [
                    'ids' => [989],
                    'name' => 'Controllers',
                    'slug' => 'controllers',
                ],
                [
                    'ids' => [988],
                    'name' => 'Monitors',
                    'slug' => 'monitors',
                ],
                [
                    'ids' => [991],
                    'name' => 'UPS',
                    'slug' => 'ups',
                ],
            ],
        ],
        [
            'ids' => [904],
            'name' => 'Razer',
            'slug' => 'razer',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/razer-logo-png_seeklogo-494802.png',
            'icon' => 'mouse',
            'accent_color' => '#2e9a63',
            'children' => [
                [
                    'ids' => [919],
                    'name' => 'Accessories',
                    'slug' => 'accessories',
                ],
                [
                    'ids' => [918],
                    'name' => 'Chairs',
                    'slug' => 'chairs',
                ],
                [
                    'ids' => [426],
                    'name' => 'Speakers',
                    'slug' => 'speakers',
                ],
                [
                    'ids' => [383],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [381],
                    'name' => 'Keyboards',
                    'slug' => 'keyboards',
                ],
                [
                    'ids' => [382],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
                [
                    'ids' => [392],
                    'name' => 'Mouse Pads',
                    'slug' => 'mouse-pads',
                ],
            ],
        ],
        [
            'ids' => [920],
            'name' => 'E-Yooso',
            'slug' => 'e-yooso',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/11/Sa699eda660894d77b8596c9abc0c3d9bm.avif',
            'icon' => 'keyboard',
            'accent_color' => '#1f6feb',
        ],
        [
            'ids' => [893],
            'name' => 'Fantech',
            'slug' => 'fantech',
            'image_url' => 'https://dmdworld.store/wp-content/uploads/2025/06/fantech.jpg',
            'icon' => 'mouse',
            'accent_color' => '#1f6feb',
            'children' => [
                [
                    'ids' => [894],
                    'name' => 'Keyboards',
                    'slug' => 'keyboards',
                ],
                [
                    'ids' => [897],
                    'name' => 'Tables and Chairs',
                    'slug' => 'tables-and-chairs',
                ],
                [
                    'ids' => [896],
                    'name' => 'Headphones',
                    'slug' => 'headphones',
                ],
                [
                    'ids' => [895],
                    'name' => 'Mouse',
                    'slug' => 'mouse',
                ],
            ],
        ],
        [
            'ids' => [946],
            'name' => 'Xiaomi',
            'slug' => 'xiaomi',
            'icon' => 'speaker',
            'accent_color' => '#ff6900',
        ],
    ],
];
