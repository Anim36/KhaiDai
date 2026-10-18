/**
 * prisma/seed.ts — DISABLED.
 *
 * Previously populated the dev DB with three demo restaurants
 * (Spice Junction, Pizza Hub, Chillox) so the Customer app had
 * real rows to render. The seed is kept here as future-reference
 * code only — it is no longer wired into `prisma migrate deploy`
 * (see `prisma.config.ts`) or the `npm run seed` script, and
 * the demo rows have been deleted from the dev database.
 *
 * New partners register through the public flow and create
 * their restaurant from the Partner Dashboard. Customer
 * browsing now shows only real partner-owned restaurants (or an
 * "no restaurants yet" empty state).
 *
 * If you ever want to re-enable seeding (e.g. for a screenshot
 * fixture), restore the `seed` key in `prisma.config.ts` and the
 * `seed` script in `package.json`.
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

const PARTNERS: Array<{
  name: string;
  email: string;
  phone: string;
  restaurant: {
    name: string;
    address: string;
    cuisine: string;
    rating: number;
    deliveryTime: number;
    deliveryFee: number;
    coverImage: string;
    openingHours: string;
  };
  items: Array<{
    name: string;
    price: number;
    category: string;
    description: string;
    image: string;
    popular?: boolean;
    available?: boolean;
  }>;
}> = [
  {
    name: "Mehedi Rahman",
    email: "spice@khaidai.bd",
    phone: "+880 1711-111000",
    restaurant: {
      name: "Spice Junction",
      address: "House 12, Road 7, Banani, Dhaka 1213",
      cuisine: "Bangladeshi",
      rating: 4.8,
      deliveryTime: 30,
      deliveryFee: 50,
      coverImage: "/assets/rest-1.png",
      openingHours: "10:00 AM – 11:00 PM",
    },
    items: [
      {
        name: "Kacchi Biryani (Full)",
        price: 320,
        category: "mains",
        description: "Aromatic basmati cooked in dum style with tender mutton.",
        image: "/assets/dish-detail-1.png",
        popular: true,
      },
      {
        name: "Chicken Tehari",
        price: 220,
        category: "mains",
        description: "Slow-cooked chicken with fragrant basmati and warm spices.",
        image: "/assets/dish-detail-2.png",
      },
      {
        name: "Seekh Kebab",
        price: 180,
        category: "starters",
        description: "Minced lamb kebab grilled over charcoal with mint chutney.",
        image: "/assets/dish-3.png",
      },
      {
        name: "Borhani",
        price: 40,
        category: "drinks",
        description: "Traditional yogurt-based digestive drink with mustard and mint.",
        image: "/assets/dish-detail-4.png",
      },
      {
        name: "Firni",
        price: 80,
        category: "desserts",
        description: "Creamy rice pudding flavoured with cardamom and pistachio.",
        image: "/assets/dish-detail-3.png",
      },
      {
        name: "Chicken Tikka",
        price: 240,
        category: "starters",
        description: "Yogurt-marinated chicken, char-grilled to smoky perfection.",
        image: "/assets/dish-1.png",
      },
    ],
  },
  {
    name: "Sumaiya Akter",
    email: "pizzahub@khaidai.bd",
    phone: "+880 1711-222000",
    restaurant: {
      name: "Pizza Hub",
      address: "Level 3, Bashundhara City, Panthapath, Dhaka 1205",
      cuisine: "Italian",
      rating: 4.6,
      deliveryTime: 35,
      deliveryFee: 60,
      coverImage: "/assets/rest-2.png",
      openingHours: "11:00 AM – 11:00 PM",
    },
    items: [
      {
        name: "Margherita Pizza",
        price: 780,
        category: "mains",
        description: "Wood-fired, San Marzano tomato, fresh basil.",
        image: "/assets/dish-detail-1.png",
        popular: true,
      },
      {
        name: "Pepperoni Pizza",
        price: 880,
        category: "mains",
        description: "Spicy pepperoni, mozzarella, tomato sauce.",
        image: "/assets/dish-detail-2.png",
      },
      {
        name: "Garlic Bread",
        price: 220,
        category: "starters",
        description: "Toasted baguette with garlic butter and parsley.",
        image: "/assets/dish-1.png",
      },
      {
        name: "Caesar Salad",
        price: 320,
        category: "starters",
        description: "Romaine, croutons, parmesan, classic Caesar dressing.",
        image: "/assets/dish-3.png",
      },
      {
        name: "Tiramisu",
        price: 380,
        category: "desserts",
        description: "Coffee-soaked ladyfingers, mascarpone, cocoa.",
        image: "/assets/dish-detail-3.png",
      },
      {
        name: "Lemon Soda",
        price: 120,
        category: "drinks",
        description: "Sparkling lemonade with fresh mint.",
        image: "/assets/dish-detail-4.png",
      },
      {
        name: "Pasta Alfredo",
        price: 590,
        category: "mains",
        description: "Fettuccine, parmesan cream, cracked black pepper.",
        image: "/assets/dish-1.png",
      },
    ],
  },
  {
    name: "Tanvir Chowdhury",
    email: "chillox@khaidai.bd",
    phone: "+880 1711-333000",
    restaurant: {
      name: "Chillox",
      address: "House 4, Road 11, Gulshan 2, Dhaka 1212",
      cuisine: "Burgers",
      rating: 4.7,
      deliveryTime: 25,
      deliveryFee: 0,
      coverImage: "/assets/rest-3.png",
      openingHours: "12:00 PM – 11:00 PM",
    },
    items: [
      {
        name: "Beef Burger Deluxe",
        price: 650,
        category: "mains",
        description: "200g smash patty, aged cheddar, brioche bun.",
        image: "/assets/dish-detail-1.png",
        popular: true,
      },
      {
        name: "Crispy Chicken Burger",
        price: 480,
        category: "mains",
        description: "Buttermilk-fried chicken, slaw, house pickles.",
        image: "/assets/dish-detail-2.png",
      },
      {
        name: "Crispy Chicken Wings",
        price: 420,
        category: "starters",
        description: "6 pieces served with house dipping sauce.",
        image: "/assets/dish-1.png",
      },
      {
        name: "Loaded Fries",
        price: 280,
        category: "starters",
        description: "Cheese sauce, bacon bits, scallions.",
        image: "/assets/dish-3.png",
      },
      {
        name: "Onion Rings",
        price: 180,
        category: "starters",
        description: "Beer-battered, golden fried, ranch dip.",
        image: "/assets/dish-2.png",
      },
      {
        name: "Chocolate Shake",
        price: 220,
        category: "drinks",
        description: "Thick cocoa shake, vanilla ice cream.",
        image: "/assets/dish-detail-4.png",
      },
      {
        name: "Molten Chocolate Cake",
        price: 360,
        category: "desserts",
        description: "Valrhona dark chocolate, vanilla ice cream.",
        image: "/assets/dish-detail-3.png",
      },
      {
        name: "Mango Lassi",
        price: 180,
        category: "drinks",
        description: "Ripe mango pulp, yogurt, cardamom, honey.",
        image: "/assets/dish-detail-4.png",
      },
    ],
  },
];

async function main() {
  const password = await bcrypt.hash("Pa55word!", 12);
  for (const p of PARTNERS) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {
        name: p.name,
        phone: p.phone,
        role: "PARTNER",
        password,
      },
      create: {
        email: p.email,
        name: p.name,
        phone: p.phone,
        role: "PARTNER",
        password,
      },
    });

    // Each partner gets exactly one restaurant. Delete any extras
    // first so re-running the seed converges to a deterministic
    // state — and we can safely call `findFirst` to upsert the
    // canonical one. We don't use Prisma's `upsert({ where: {
    // ownerId } })` because `ownerId` is indexed, not unique.
    const existingForOwner = await prisma.restaurant.findFirst({
      where: { ownerId: user.id },
    });
    if (
      existingForOwner &&
      existingForOwner.name !== p.restaurant.name
    ) {
      await prisma.restaurant.delete({ where: { id: existingForOwner.id } });
    }

    const restaurant = existingForOwner
      ? await prisma.restaurant.update({
          where: { id: existingForOwner.id },
          data: {
            name: p.restaurant.name,
            address: p.restaurant.address,
            cuisine: p.restaurant.cuisine,
            rating: p.restaurant.rating,
            deliveryTime: p.restaurant.deliveryTime,
            deliveryFee: p.restaurant.deliveryFee,
            coverImage: p.restaurant.coverImage,
            openingHours: p.restaurant.openingHours,
          },
        })
      : await prisma.restaurant.create({
          data: {
            ownerId: user.id,
            name: p.restaurant.name,
            address: p.restaurant.address,
            cuisine: p.restaurant.cuisine,
            rating: p.restaurant.rating,
            deliveryTime: p.restaurant.deliveryTime,
            deliveryFee: p.restaurant.deliveryFee,
            coverImage: p.restaurant.coverImage,
            openingHours: p.restaurant.openingHours,
          },
        });

    // Replace menu items wholesale — partners don't accumulate test
    // items forever, and the seed is the canonical menu snapshot.
    await prisma.menuItem.deleteMany({
      where: { restaurantId: restaurant.id },
    });
    if (p.items.length > 0) {
      await prisma.menuItem.createMany({
        data: p.items.map((it) => ({
          restaurantId: restaurant.id,
          name: it.name,
          price: it.price,
          category: it.category,
          description: it.description,
          image: it.image,
          popular: it.popular ?? false,
          available: it.available ?? true,
        })),
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `seeded partner=${p.email}  restaurant=${restaurant.name}  items=${p.items.length}`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
