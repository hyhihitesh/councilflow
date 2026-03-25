"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"

export function ZenToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isZen = searchParams.get("zen") === "true"

  const toggleZen = () => {
    const params = new URLSearchParams(searchParams.toString())
    if (isZen) {
      params.delete("zen")
    } else {
      params.set("zen", "true")
    }
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <button
      onClick={toggleZen}
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-[10px] font-medium uppercase tracking-widest transition-all rounded-sm border",
        isZen 
          ? "bg-[#2C2A26] text-[#F7F6F2] border-[#2C2A26]" 
          : "bg-white text-[#716E68] border-[#EBE8E0] hover:text-[#2C2A26] hover:border-[#D5D1C6]"
      )}
      title={isZen ? "Disable Zen Mode" : "Enable Zen Mode"}
    >
      {isZen ? (
        <>
          <EyeOff className="h-3 w-3" />
          <span>Zen Mode On</span>
        </>
      ) : (
        <>
          <Eye className="h-3 w-3" />
          <span>Zen Mode Off</span>
        </>
      )}
    </button>
  )
}
