import type { PropertyType } from '@toppo-tracker/shared';
import {
  CalendarIcon,
  HashIcon,
  ListChecksIcon,
  ListIcon,
  type LucideIcon,
  SquareCheckIcon,
  TypeIcon,
  UserIcon,
} from 'lucide-react';

/** The mark of each type of property, wherever a property shows with its type. */
export const PROPERTY_TYPE_ICONS: Readonly<Record<PropertyType, LucideIcon>> = {
  list: ListIcon,
  multiSelect: ListChecksIcon,
  text: TypeIcon,
  number: HashIcon,
  date: CalendarIcon,
  user: UserIcon,
  checkbox: SquareCheckIcon,
};
