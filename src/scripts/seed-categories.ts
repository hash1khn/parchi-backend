import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const initialCategories = [
  {
    name: 'Food & Beverages',
    sortOrder: 1,
    subcategories: [
      'Fast Food', 'Pizza', 'Burgers', 'Desi', 'Asian', 'BBQ',
      'Cafés', 'Coffee Shops', 'Desserts & Ice Cream', 'Bakery', 'Juices & Smoothies'
    ]
  },
  {
    name: 'Sports',
    sortOrder: 2,
    subcategories: [
      'Indoor sports clubs', 'Snooker clubs', 'Football', 'Cricket',
      'Badminton', 'Tennis & Padel', 'Swimming', 'Martial Arts',
      'Sportswear', 'Sports Equipment', 'Coaching & Academies'
    ]
  },
  {
    name: 'Entertainment',
    sortOrder: 3,
    subcategories: [
      'Cinemas', 'Gaming', 'Escape Rooms', 'Bowling', 'Go-Karting',
      'Theme Parks', 'Board Games', 'Events & Concerts', 'VR Experiences'
    ]
  },
  {
    name: 'Fitness & Wellness',
    sortOrder: 4,
    subcategories: [
      'Gyms', 'CrossFit', 'Physiotherapy', 'Wellness Centers'
    ]
  },
  {
    name: 'Lifestyle',
    sortOrder: 5,
    subcategories: [
      'Beauty & Grooming', 'Salons & Barbers', 'Skincare & Cosmetics',
      'Perfumes', 'Accessories', 'Gifts', 'Books & Stationery', 'Tech Accessories'
    ]
  }
];

async function main() {
  console.log('Seeding merchant categories and subcategories...');

  for (const catData of initialCategories) {
    // Upsert Category
    let category = await prisma.merchant_categories.findUnique({
      where: { name: catData.name }
    });

    if (!category) {
      category = await prisma.merchant_categories.create({
        data: {
          name: catData.name,
          sort_order: catData.sortOrder,
          is_active: true
        }
      });
      console.log(`Created Category: ${catData.name}`);
    } else {
      // Update sort order if category exists
      category = await prisma.merchant_categories.update({
        where: { id: category.id },
        data: { sort_order: catData.sortOrder }
      });
      console.log(`Updated Category sort order: ${catData.name}`);
    }

    // Seed Subcategories
    let subSort = 1;
    for (const subName of catData.subcategories) {
      const existingSub = await prisma.merchant_subcategories.findUnique({
        where: {
          category_id_name: {
            category_id: category.id,
            name: subName
          }
        }
      });

      if (!existingSub) {
        await prisma.merchant_subcategories.create({
          data: {
            category_id: category.id,
            name: subName,
            sort_order: subSort++,
            is_active: true
          }
        });
        console.log(`  Created Subcategory: ${subName}`);
      } else {
        await prisma.merchant_subcategories.update({
          where: { id: existingSub.id },
          data: { sort_order: subSort++ }
        });
      }
    }
  }

  console.log('Seeded categories successfully.');
}

main()
  .catch((e) => {
    console.error('Error seeding categories:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
