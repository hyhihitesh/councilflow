"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  GitGraph,
  Mail,
  PenTool,
  BarChart3,
  Settings,
  Plus,
  Send,
  Zap,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push("/dashboard"))}>
            <LayoutDashboard className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Dashboard</span>
            <CommandShortcut>⌘D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/prospects"))}>
            <Users className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Prospects</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/pipeline"))}>
            <GitGraph className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Pipeline</span>
            <CommandShortcut>⌘B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/outreach"))}>
            <Mail className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Outreach</span>
            <CommandShortcut>⌘O</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/content-studio"))}>
            <PenTool className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Content Studio</span>
            <CommandShortcut>⌘C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/analytics"))}>
            <BarChart3 className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Analytics</span>
            <CommandShortcut>⌘A</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => runCommand(() => router.push("/prospects"))}>
            <Plus className="mr-3 h-4 w-4 text-emerald-600" />
            <span>Add Prospect</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/outreach"))}>
            <Send className="mr-3 h-4 w-4 text-indigo-600" />
            <span>Write Outreach</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/content-studio"))}>
            <Zap className="mr-3 h-4 w-4 text-amber-600" />
            <span>Generate AI Post</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem onSelect={() => runCommand(() => router.push("/settings"))}>
            <Settings className="mr-3 h-4 w-4 text-[#716E68]" />
            <span>Preferences</span>
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
