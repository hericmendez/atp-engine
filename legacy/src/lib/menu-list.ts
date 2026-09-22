import {

  Settings,
  Bookmark,
  SquarePen,

  LucideIcon,
  GamepadIcon,
  HomeIcon,
  BugIcon,
  FormInputIcon,
  FileIcon
} from "lucide-react";

type Submenu = {
  href: string;
  label: string;
  active?: boolean;
};

type Menu = {
  href: string;
  label: string;
  active?: boolean;
  icon: LucideIcon;
  submenus?: Submenu[];
};

type Group = {
  groupLabel: string;
  menus: Menu[];
};

export function getMenuList(pathname: string): Group[] {
  return [
    {
      groupLabel: "Contents",
      menus: [
        {
          href: "",
          label: "Home",
          icon: HomeIcon,
          submenus: [
            {
              href: "/placeholder",
              label: "Placeholder"
            },

          ]
        },

        {
          href: "/components",
          label: "Search",
          icon: Bookmark,
          submenus: [
            {
              href: "/*",
              label: "Advanced Search"
            },
            {
              href: "/*",
              label: "Developers"
            },
            {
              href: "/*",
              label: "Franchises"
            },
            {
              href: "/*",
              label: "Generations"
            },
            {
              href: "/*",
              label: "Genres"
            },
            {
              href: "/*",
              label: "Platforms"
            },

            {
              href: "/components/form-modal",
              label: "Form Modal"
            },
            {
              href: "/crud",
              label: "CRUD"
            }
          ]
        },
/*         {
          href: "/backlog",
          label: "Backlog",
          icon: GamepadIcon,
          submenus: [

          ]
        } */
      ]
    },

    {
      groupLabel: "Settings",
      menus: [
        {
          href: "/users",
          label: "Preferences",
          icon: Settings
        }
      ]
    },

    {
      groupLabel: "Debug",
      menus: [
        {
          href: "/crud",
          label: "CRUD TEST",
          icon: BugIcon
        },

        {
          href: "/components/form-modal",
          icon: FileIcon,
          label: "Form Modal"
        },]
    },
  ];
}
